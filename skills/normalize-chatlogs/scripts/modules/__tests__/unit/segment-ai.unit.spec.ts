// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/segment-ai.unit.spec.ts
// @(#): segment-ai モジュールのユニットテスト
//       対象: segmentChatlogs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
import type { DenoCommandLike } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { segmentChatlogs } from '../../segment-ai.ts';

// ─── Helpers
import { assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';
// functions
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
// mock helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeDelayedSuccessMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';

// ─── Internal Helpers

// functions

/** テスト用の `ChatlogEntry` を `filePath` と本文 `content` から生成する（frontmatterなし）。 */
const _makeEntry = (filePath: string, content: string): ChatlogEntry => new ChatlogEntry(content, { filePath });

// constants

/** `_addLineNumbers` の行番号パディング仕様を検証するテストケース（行インデックス → 期待される行頭プレフィックス）。 */
const _lineNumberPaddingCases = [
  { lineIndex: 1, expectedPrefix: '    1: ' },
  { lineIndex: 42, expectedPrefix: '   42: ' },
  { lineIndex: 99999, expectedPrefix: '99999: ' },
  { lineIndex: 100000, expectedPrefix: '100000: ' },
] as const;

// classes

/**
 * 非ゼロ exit かつ stderr に rate limit 文言を含む出力を模倣するモッククラス。
 *
 * `runAI` の `_isRateLimit` 判定（stderr に対する `/rate.?limit|429/i`）を発火させ、
 * `ChatlogError('AiError', 'RateLimit', ...)` を throw させるために使用する。
 * `BaseMockCommand.spawn()` は `output()` のみを呼ぶため、stderr を持つ `makeOutput()` を独自実装する。
 */
class _RateLimitMockCommand extends BaseMockCommand {
  constructor(_cmd: string, _opts: unknown) {
    super();
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return Promise.resolve({
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: new TextEncoder().encode('rate limit exceeded'),
    });
  }
}

/** `_RateLimitMockCommand` を `DenoCommandLike` として返すファクトリヘルパー。 */
const _makeRateLimitMock = (): DenoCommandLike => _RateLimitMockCommand as unknown as DenoCommandLike;

/**
 * stdin に書き込まれた内容をキャプチャするモック。
 *
 * `runAI` が `getWriter().write()` で送る userPrompt を検証するために使用する。
 * `capturedStdin` にデコードされた文字列が蓄積される。
 */
class _StdinCaptureMock extends BaseMockCommand {
  private readonly stdout: Uint8Array;
  readonly capturedStdin: string[] = [];

  constructor(_cmd: string, _opts: unknown, stdout: Uint8Array) {
    super();
    this.stdout = stdout;
  }

  override spawn() {
    const captured = this.capturedStdin;
    return {
      stdin: {
        getWriter() {
          return {
            write(data: Uint8Array): Promise<void> {
              captured.push(new TextDecoder().decode(data));
              return Promise.resolve();
            },
            close(): Promise<void> {
              return Promise.resolve();
            },
          };
        },
      },
      output: () => this.makeOutput(),
    };
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: this.stdout });
  }
}

// functions

/**
 * `_StdinCaptureMock` を `DenoCommandLike` として返すファクトリヘルパー。
 *
 * @param stdout - AI が返す stdout バイト列
 * @param captured - stdin のキャプチャ先（インスタンスを後から参照するための出口）
 * @returns `DenoCommandLike` クラス
 */
const _makeStdinCaptureMock = (
  stdout: Uint8Array,
  captured: { instance: _StdinCaptureMock | null },
): DenoCommandLike => {
  return class extends _StdinCaptureMock {
    constructor(cmd: string, opts: unknown) {
      super(cmd, opts, stdout);
      captured.instance = this;
    }
  } as unknown as DenoCommandLike;
};

// classes

/**
 * `Deno.Command` に渡された `opts.signal` をキャプチャする成功モック。
 *
 * `runAI` は常に内部タイムアウト用の signal を `AbortSignal.any()` で合成して渡すため、
 * `options.signal` を渡していなくても signal 自体は必ず存在する。そのため単なる
 * `signal !== undefined` はテストとして無意味であり、外部から渡した `AbortController`
 * を `abort()` した後に、キャプチャした合成 signal が `.aborted === true` になることを
 * 確認することで、リレーの有無を判別する。
 */
class _SignalCaptureMock extends BaseMockCommand {
  private readonly stdout: Uint8Array;
  readonly signal?: AbortSignal;

  constructor(_cmd: string, opts: { signal?: AbortSignal }, stdout: Uint8Array) {
    super();
    this.stdout = stdout;
    this.signal = opts.signal;
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: this.stdout });
  }
}

// functions

/**
 * `_SignalCaptureMock` を `DenoCommandLike` として返すファクトリヘルパー。
 *
 * @param stdout - AI が返す stdout バイト列
 * @param captured - モックインスタンスの受け渡し先（呼び出し後に signal を検査するための出口）
 * @returns `DenoCommandLike` クラス
 */
const _makeSignalCaptureMock = (
  stdout: Uint8Array,
  captured: { instance: _SignalCaptureMock | null },
): DenoCommandLike => {
  return class extends _SignalCaptureMock {
    constructor(cmd: string, opts: { signal?: AbortSignal }) {
      super(cmd, opts, stdout);
      captured.instance = this;
    }
  } as unknown as DenoCommandLike;
};

// ─── Tests

// ─── segmentChatlogs tests ────────────────────────────────────────────────────

/**
 * `segmentChatlogs` のユニットテストスイート。
 *
 * 複数ファイルをまとめて1回のAI呼び出しでセグメント分割する関数の
 * 正常系・異常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-SC-01-01, T-SC-05-01, T-SC-05-02, T-SCB-01-01 〜 T-SCB-06-01, T-SCB-02-03 〜 T-SCB-02-04,
 * T-SIO-LR-14, T-SIO-LR-19 〜 T-SIO-LR-25, T-SIO-LOG-01 〜 T-SIO-LOG-02
 *
 * @see segmentChatlogs
 */
describe('segmentChatlogs', () => {
  let mockHandle: CommandMockHandle;

  afterEach(() => {
    mockHandle?.restore();
  });

  describe('When: 正常系', () => {
    it('[Normal] T-SC-01-01: 1要素入力でAIが有効なJSON(envelope形式)を返すとき Segment[]をMapで返す', async () => {
      // arrange
      const aiResult = [
        {
          filePath: 'test.md',
          segments: [
            { title: 'Topic 1', summary: 'Summary 1', startLine: 1, endLine: 1 },
            { title: 'Topic 2', summary: 'Summary 2', startLine: 2, endLine: 2 },
          ],
        },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs([_makeEntry('test.md', 'Body 1\nBody 2')]);

      // assert
      assertEquals(result.get('test.md'), [
        { title: 'Topic 1', summary: 'Summary 1', startLine: 1, endLine: 1 },
        { title: 'Topic 2', summary: 'Summary 2', startLine: 2, endLine: 2 },
      ]);
    });

    it('[Normal] T-SCB-01-01: 2ファイル入力でAIが有効なJSONを返すとき各ファイルのSegment[]をMapで返す', async () => {
      // arrange
      const inputs = [
        _makeEntry('a.md', 'C1'),
        _makeEntry('b.md', 'C2'),
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'T1', summary: 'S1', startLine: 1, endLine: 1 }] },
        { filePath: 'b.md', segments: [{ title: 'T2', summary: 'S2', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('a.md'), [{ title: 'T1', summary: 'S1', startLine: 1, endLine: 1 }]);
      assertEquals(result.get('b.md'), [{ title: 'T2', summary: 'S2', startLine: 1, endLine: 1 }]);
    });

    it('[Normal] T-SCB-01-02: 1ファイルでAIが12セグメントを返すとき先頭5件に制限される（MAX_SEGMENTS上限）', async () => {
      // arrange
      const content = Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n');
      const inputs = [_makeEntry('big.md', content)];
      const manySegments = Array.from({ length: 12 }, (_, i) => ({
        title: `Topic ${i + 1}`,
        summary: `Summary ${i + 1}`,
        startLine: i + 1,
        endLine: i + 1,
      }));
      const aiResult = [{ filePath: 'big.md', segments: manySegments }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('big.md')?.length, 5);
      assertEquals(result.get('big.md')?.[0].title, 'Topic 1');
      assertEquals(result.get('big.md')?.[4].title, 'Topic 5');
    });
  });

  /** model オプションを指定・省略したときの Deno.Command args 検証ケース。 */
  describe('When: 正常系 — model 指定', () => {
    it('[Normal] T-SC-05-01: model を明示指定したとき Deno.Command args に --model <指定モデル> が含まれる', async () => {
      // arrange
      const aiResult = [
        { filePath: 'test.md', segments: [{ title: 'Topic 1', summary: 'Summary 1', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      // act
      await segmentChatlogs([_makeEntry('test.md', 'content')], { model: 'claude-sonnet-4-6' });

      // assert
      const modelIndex = capturedArgs.value.indexOf('--model');
      assertNotEquals(modelIndex, -1);
      assertEquals(capturedArgs.value[modelIndex + 1], 'claude-sonnet-4-6');
    });

    it('[Normal] T-SC-05-02: model を省略したとき Deno.Command args に --model DEFAULT_AI_MODEL が含まれる', async () => {
      // arrange
      const aiResult = [
        { filePath: 'test.md', segments: [{ title: 'Topic 1', summary: 'Summary 1', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      // act
      await segmentChatlogs([_makeEntry('test.md', 'content')]);

      // assert
      const modelIndex = capturedArgs.value.indexOf('--model');
      assertNotEquals(modelIndex, -1);
      assertEquals(capturedArgs.value[modelIndex + 1], DEFAULT_AI_MODEL);
    });
  });

  describe('When: 異常系', () => {
    it('[Error] T-SCB-02-01: AIが非ゼロ exit のとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [
        _makeEntry('a.md', 'content a'),
        _makeEntry('b.md', 'content b'),
      ];
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
      assertNull(result.get('b.md'));
    });

    it('[Error] T-SCB-02-02: AIが不正JSONを返すとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [_makeEntry('a.md', 'content a')];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
    });

    it('[Error] T-SCB-WL-01: AI が非ゼロ exit のとき logger.warn が呼ばれる', async () => {
      // arrange
      const inputs = [_makeEntry('file-a.md', 'content a')];
      mockHandle = installCommandMock(makeFailMock(1));
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await segmentChatlogs(inputs);

        // assert — warn が 1 回呼ばれ、ファイル名（拡張子なし）がメッセージに含まれる
        assertEquals(warnStub.calls.length, 1);
        assert(warnStub.calls[0].args[0].includes('file-a'));
      } finally {
        warnStub?.restore();
      }
    });

    it('[Error] T-SCB-WL-02: AI が不正 JSON を返すとき logger.warn が呼ばれる', async () => {
      // arrange
      const inputs = [_makeEntry('file-b.md', 'content b')];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await segmentChatlogs(inputs);

        // assert — warn が 1 回呼ばれ、ファイル名（拡張子なし）がメッセージに含まれる
        assertEquals(warnStub.calls.length, 1);
        assert(warnStub.calls[0].args[0].includes('file-b'));
      } finally {
        warnStub?.restore();
      }
    });

    it('[Error] T-SCB-02-03: runAI が ChatlogError(AiError, RateLimit) を throw するとき握りつぶさず再 throw する', async () => {
      // arrange — stderr に "rate limit" を含む非ゼロ exit を返す runAI 呼び出し
      const inputs = [_makeEntry('a.md', 'content a')];
      mockHandle = installCommandMock(_makeRateLimitMock());

      // act & assert — 例外がそのまま呼び出し元に伝播する
      const error = await assertRejects(() => segmentChatlogs(inputs), ChatlogError);
      assertEquals(error.kind, 'AiError');
      assertEquals(error.subindex, 'RateLimit');
    });

    it('[Error] T-SCB-02-04: ChatlogError 以外の一般的な Error は握りつぶされ全ファイルが null の Map を返す', async () => {
      // arrange — spawn() が Deno.errors.NotFound（非 ChatlogError）を throw するモック
      const inputs = [_makeEntry('a.md', 'content a')];
      mockHandle = installCommandMock(makeNotFoundMock());

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SCB-03-01: 1ファイル入力でも正常動作する', async () => {
      // arrange
      const inputs = [_makeEntry('solo.md', 'C')];
      const aiResult = [
        { filePath: 'solo.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('solo.md'), [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }]);
    });

    it('[Edge] T-SCB-04-01: AIが返す filePath が inputs にない場合無視され、inputs にある filePath は null になる', async () => {
      // arrange
      const inputs = [_makeEntry('known.md', 'content')];
      const aiResult = [
        { filePath: 'unknown.md', segments: [{ title: 'T', summary: 'S', content: 'C' }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('known.md'));
      assertFalse(result.has('unknown.md'));
    });
  });

  /** userPrompt に行番号付きコンテンツが含まれることを検証するケース。 */
  describe('When: userPrompt 行番号付きコンテンツ', () => {
    it('[Normal] T-SIO-LR-14: userPrompt に行番号付きコンテンツが含まれる', async () => {
      // arrange
      const aiResult = [
        { filePath: 'test.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 2 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      const captured: { instance: _StdinCaptureMock | null } = { instance: null };
      mockHandle = installCommandMock(_makeStdinCaptureMock(stdout, captured));
      const content = 'line A\nline B';

      // act
      await segmentChatlogs([_makeEntry('test.md', content)]);

      // assert — stdin には "    1: line A\n    2: line B" が含まれる（5桁固定幅右詰め）
      assert(captured.instance !== null, 'mock was not instantiated');
      const written = captured.instance.capturedStdin.join('');
      assert(
        written.includes('    1: line A\n    2: line B'),
        `expected line-numbered content in stdin, got: ${written}`,
      );
    });

    for (const { lineIndex, expectedPrefix } of _lineNumberPaddingCases) {
      it(`[Normal] T-SIO-LR-26: 行番号 ${lineIndex} は "${expectedPrefix}" というプレフィックスで出力される`, async () => {
        // arrange
        const aiResult = [
          { filePath: 'test.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
        ];
        const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
        const captured: { instance: _StdinCaptureMock | null } = { instance: null };
        mockHandle = installCommandMock(_makeStdinCaptureMock(stdout, captured));
        const content = Array.from({ length: lineIndex }, (_, i) => `L${i + 1}`).join('\n');

        // act
        await segmentChatlogs([_makeEntry('test.md', content)]);

        // assert — 対象行の行頭プレフィックスが仕様通り（1〜5桁は5桁固定幅右詰め、6桁以上はパディングなし）
        assert(captured.instance !== null, 'mock was not instantiated');
        const written = captured.instance.capturedStdin.join('');
        const targetLine = written.split('\n').find((line) => line.startsWith(expectedPrefix));
        assert(targetLine !== undefined, `expected a line starting with "${expectedPrefix}", got: ${written}`);
      });
    }
  });

  /** 行番号範囲方式（_AiSegmentRange）: startLine/endLine でバッチ処理するケース。 */
  describe('When: 行番号範囲方式（_AiSegmentRange）', () => {
    it('[Normal] T-SIO-LR-19: 2ファイル入力でAIが {startLine,endLine} 返すとき各ファイルの Segment[] を Map で返す', async () => {
      // arrange
      const inputs = [
        _makeEntry('a.md', 'a1\na2\na3'),
        _makeEntry('b.md', 'b1\nb2'),
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 2 }] },
        { filePath: 'b.md', segments: [{ title: 'BT', summary: 'BS', startLine: 1, endLine: 2 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert — 各ファイルの segments は自身の filePath の AI レスポンスにのみ紐づく（取り違えがない）
      assertEquals(result.get('a.md'), [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 2 }]);
      assertEquals(result.get('b.md'), [{ title: 'BT', summary: 'BS', startLine: 1, endLine: 2 }]);
    });

    it('[Normal] T-SIO-LR-20: 各ファイルの行番号は独立（ファイルごとにリセット）', async () => {
      // arrange
      const inputs = [
        _makeEntry('a.md', 'lineA1\nlineA2'),
        _makeEntry('b.md', 'lineB1\nlineB2\nlineB3'),
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 1 }] },
        { filePath: 'b.md', segments: [{ title: 'BT', summary: 'BS', startLine: 2, endLine: 3 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert — b.md の range (2-3) が a.md 側に混入しない（ファイルごとに独立して保持される）
      assertEquals(result.get('a.md'), [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 1 }]);
      assertEquals(result.get('b.md'), [{ title: 'BT', summary: 'BS', startLine: 2, endLine: 3 }]);
    });

    it('[Error] T-SIO-LR-21: AIが非ゼロ exit のとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [
        _makeEntry('a.md', 'content a'),
        _makeEntry('b.md', 'content b'),
      ];
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
      assertNull(result.get('b.md'));
    });

    it('[Error] T-SIO-LR-22: AIが不正 JSON を返すとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [_makeEntry('a.md', 'content a')];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
    });

    it('[Edge] T-SIO-LR-23: AIが返す filePath が inputs にない場合無視され inputs 側は null になる', async () => {
      // arrange
      const inputs = [_makeEntry('known.md', 'c')];
      const aiResult = [
        { filePath: 'unknown.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('known.md'));
      assertFalse(result.has('unknown.md'));
    });

    it('[Edge] T-SIO-LR-24: 1ファイルで6件のセグメントを返すとき先頭5件に制限される（MAX_SEGMENTS=5）', async () => {
      // arrange
      const inputs = [_makeEntry('big.md', 'l1\nl2\nl3\nl4\nl5\nl6')];
      const aiSegments = Array.from({ length: 6 }, (_, i) => ({
        title: `Topic ${i + 1}`,
        summary: `Sum ${i + 1}`,
        startLine: i + 1,
        endLine: i + 1,
      }));
      const aiResult = [{ filePath: 'big.md', segments: aiSegments }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('big.md')?.length, 5);
    });

    it('[Edge] T-SIO-LR-25: timeoutMs:1 を渡すとタイムアウトして全ファイルが null の Map を返す', async () => {
      // arrange — AI が 50ms 後に応答するモック
      const inputs = [_makeEntry('a.md', 'content a')];
      const aiResult = [{ filePath: 'a.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeDelayedSuccessMock(50, stdout));

      // act — 1ms タイムアウト: 50ms の遅延より先に abort される
      const result = await segmentChatlogs(inputs, { timeoutMs: 1 });

      // assert
      assertNull(result.get('a.md'));
    });
  });

  /** timeoutMs オプション転送: 指定・省略時の動作を検証するケース。 */
  describe('When: timeoutMs オプション', () => {
    it('[Normal] T-SCB-05-01: timeoutMs: 1 を渡すとタイムアウトして全ファイルが null の Map を返す', async () => {
      // arrange — AI が 50ms 後に応答するモック
      const inputs = [_makeEntry('a.md', 'content a')];
      const aiResult = [{ filePath: 'a.md', segments: [{ title: 'T', summary: 'S', content: 'C' }] }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeDelayedSuccessMock(50, stdout));

      // act — 1ms タイムアウト: 50ms の遅延より先に abort される
      const result = await segmentChatlogs(inputs, { timeoutMs: 1 });

      // assert
      assertNull(result.get('a.md'));
    });

    it('[Normal] T-SCB-05-02: timeoutMs を省略するとデフォルト(120s)が使われ正常にセグメントを返す', async () => {
      // arrange — AI が 50ms 後に応答するモック
      const inputs = [_makeEntry('a.md', 'C')];
      const aiResult = [{ filePath: 'a.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeDelayedSuccessMock(50, stdout));

      // act — timeoutMs 省略: デフォルト 120s >> 50ms 遅延
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('a.md'), [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }]);
    });
  });

  /** signal オプション転送: `runAI` に外部 `AbortSignal` がリレーされることを検証するケース。 */
  describe('When: signal オプション', () => {
    it('[Normal] T-SCB-06-01: options.signal を渡すと runAI に転送され、abort すると Deno.Command 側の signal も abort される', async () => {
      // arrange
      const inputs = [_makeEntry('a.md', 'content a')];
      const aiResult = [{ filePath: 'a.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      const captured: { instance: _SignalCaptureMock | null } = { instance: null };
      mockHandle = installCommandMock(_makeSignalCaptureMock(stdout, captured));
      const controller = new AbortController();

      // act
      await segmentChatlogs(inputs, { signal: controller.signal });
      controller.abort();

      // assert — runAI が options.signal を AbortSignal.any() に含めていればここで abort が伝播する
      assert(captured.instance !== null, 'mock was not instantiated');
      assertEquals(captured.instance.signal?.aborted, true);
    });
  });

  /** systemPrompt の内容検証: 「必ず 1 件以上返す」指示が含まれることを確認するケース。 */
  describe('When: systemPrompt 内容検証', () => {
    it('[Normal] T-SCB-SP-01: systemPrompt に "at least 1 segment" が含まれる', async () => {
      // arrange
      const aiResult = [
        { filePath: 'test.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      // act
      await segmentChatlogs([_makeEntry('test.md', 'single line')]);

      // assert — args must have been captured
      assert(capturedArgs.value.length > 0, 'no args captured — mock did not fire');
      const argsText = capturedArgs.value.join(' ');
      assert(argsText.includes('at least 1 segment'), `expected "at least 1 segment" in args, got: ${argsText}`);
    });
  });

  /** AI がエントリを返さなかった・空セグメントを返したときの warn ログ検証ケース。 */
  describe('When: エッジケース — ログ出力', () => {
    it('[Edge] T-SIO-LOG-01: AI が当該ファイルのエントリを返さなかったとき "no entry returned for" を含む warn が出る', async () => {
      // arrange — input は known.md だが AI は unknown.md のエントリのみ返す
      const inputs = [_makeEntry('known.md', 'content')];
      const aiResult = [
        { filePath: 'unknown.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await segmentChatlogs(inputs);

        // assert
        assertEquals(warnStub.calls.length, 1);
        assert(warnStub.calls[0].args[0].includes('no entry returned for'));
      } finally {
        warnStub?.restore();
      }
    });

    it('[Edge] T-SIO-LOG-02: AI が segments:[] を返したとき "empty segments returned for" を含む warn が出る', async () => {
      // arrange — AI は known.md のエントリを返すが segments は空配列
      const inputs = [_makeEntry('known.md', 'content')];
      const aiResult = [
        { filePath: 'known.md', segments: [] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await segmentChatlogs(inputs);

        // assert
        assertEquals(warnStub.calls.length, 1);
        assert(warnStub.calls[0].args[0].includes('empty segments returned for'));
      } finally {
        warnStub?.restore();
      }
    });
  });
});
