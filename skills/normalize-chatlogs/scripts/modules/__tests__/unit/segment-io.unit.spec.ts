// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/segment-io.unit.spec.ts
// @(#): segment-io モジュールのユニットテスト
//       対象: extractSegmentBaseName, generateOutputFileName, generateSegmentFile, attachFrontmatter, segmentChatlogs, writeSegmentToFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words aaabbbb

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
import type { DenoCommandLike } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import {
  attachFrontmatter,
  extractSegmentBaseName,
  generateOutputFileName,
  generateSegmentFile,
  segmentChatlogs,
  START_BODY_HEADING,
  writeSegmentToFile,
} from '../../segment-io.ts';

// ─── Helpers
import { assertFileExist, assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';
// functions
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
// constants
import { MAX_SEGMENTS } from '../../../constants/normalize.constants.ts';
// mock helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeDelayedSuccessMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../../../_scripts/classes/ChatlogFrontmatter.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import type { Stats } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// classes

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

// ─── Tests

// ─── extractSegmentBaseName tests ────────────────────────────────────────────────────

/**
 * `extractSegmentBaseName` のユニットテストスイート。
 *
 * ファイルパスからディレクトリ・拡張子・末尾ハッシュ(-XXXXXXX)を除去して
 * ベース名を返す純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-05-01-01 〜 T-05-02-02
 *
 * @see extractSegmentBaseName
 */
describe('extractSegmentBaseName', () => {
  /** ディレクトリ・.md 拡張子・末尾 7 桁ハッシュを除去する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-05-01-01: ディレクトリと .md 拡張子を除去したファイル名を返す', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, 'test-file');
    });

    it('[Normal] T-05-01-02: 末尾の -XXXXXXX (7桁 hex) を除去する', () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });

    it('[Normal] T-05-01-03: 末尾が 7 桁 hex でない場合はハッシュ除去しない', () => {
      const filePath = 'path/to/2026-03-11-topic.md';

      const result = extractSegmentBaseName(filePath);

      assertEquals(result, '2026-03-11-topic');
    });
  });

  /** ディレクトリなし・拡張子なしの境界条件ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-05-02-01: ディレクトリなしでも .md 拡張子を除去して返す', () => {
      const result = extractSegmentBaseName('simple-file.md');

      assertEquals(result, 'simple-file');
    });

    it('[Edge] T-05-02-02: 拡張子がない場合はファイル名をそのまま返す', () => {
      const result = extractSegmentBaseName('no-extension');

      assertEquals(result, 'no-extension');
    });
  });
});

// ─── generateOutputFileName tests ─────────────────────────────────────────────

/**
 * `generateOutputFileName` のユニットテストスイート。
 *
 * `<baseName>-<XX>-<hash7>.md` 形式の出力ファイル名を生成する関数の
 * フォーマット・連番・ハッシュ注入を検証する。
 *
 * hash7 は `hashFn` 引数として注入した値が使われる。
 * `hashFn` 未指定時は `generateHash(baseName, { length: 7 })` で SHA-256 由来の 7 文字ハッシュを返す。
 *
 * テスト ID 範囲: T-06-01-01 〜 T-06-04-01
 *
 * @see generateOutputFileName
 */
describe('generateOutputFileName', () => {
  let hashFn: () => string;

  beforeEach(() => {
    hashFn = () => 'abc1234';
  });

  /** 標準的な chatlog ファイルパスと index から正しいフォーマットのファイル名を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-06-01-01: index=0 のとき hashFn 戻り値を使い <baseName>-01-<hash7>.md を返す', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 0, hashFn);

      assertEquals(result, 'test-file-01-abc1234.md');
    });

    it('[Normal] T-06-01-02: index=1 のとき連番が "02" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 1, hashFn);

      assertEquals(result, 'test-file-02-abc1234.md');
    });

    it('[Normal] T-06-01-03: index=9 のとき連番が "10" になる', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/test-file.md';

      const result = await generateOutputFileName(filePath, 9, hashFn);

      assertEquals(result, 'test-file-10-abc1234.md');
    });

    it('[Normal] T-06-04-01: ソースの末尾ハッシュを除去したベース名で出力名を生成する', async () => {
      const filePath = 'chatlogs/claude/2026/2026-03/2026-03-11-topic-abc1234.md';

      const result = await generateOutputFileName(filePath, 0, hashFn);

      assertEquals(result, '2026-03-11-topic-01-abc1234.md');
    });
  });
});

// ─── generateSegmentFile tests ────────────────────────────────────────────────

/**
 * `generateSegmentFile` のユニットテストスイート。
 *
 * セグメントオブジェクト `{title, summary, content}` から Markdown ファイルコンテンツを生成する関数の
 * 正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-11-01-01 〜 T-11-02-01
 *
 * @see generateSegmentFile
 */
describe('generateSegmentFile', () => {
  /** summary・content フィールドが正しいセクションとして出力される正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-11-01-01: 返却文字列に `## Summary\\nFix CI pipeline` が含まれる', () => {
      const seg = { title: 'Fix CI pipeline', summary: 'Fix CI pipeline', content: '### User\nHow do I fix CI?' };

      const result = generateSegmentFile(seg);

      assert(result.includes('## Summary\n\nFix CI pipeline'));
    });

    it('[Normal] T-11-01-02: 返却文字列に START_BODY_HEADING + "\\n### User\\nHow do I..." が含まれる', () => {
      const seg = { title: 'Debug session', summary: 'Debug session', content: '### User\nHow do I...' };

      const result = generateSegmentFile(seg);

      assert(result.includes(START_BODY_HEADING + '\n\n### User\nHow do I...'));
    });
  });

  /** 全フィールドが空でも両セクション見出しを含む文字列を返すエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-11-02-01: 返却文字列に `## Summary` と START_BODY_HEADING の両セクション見出しが含まれる', () => {
      const seg = { title: '', summary: '', content: '' };

      const result = generateSegmentFile(seg);

      assert(result.includes('## Summary'));
      assert(result.includes(START_BODY_HEADING));
    });
  });
});

// ─── attachFrontmatter tests ──────────────────────────────────────────────────

/**
 * `attachFrontmatter` のユニットテストスイート。
 *
 * ChatlogFrontmatter インスタンスとセグメントメタデータを合成して `---` デリミタ付きフロントマターを
 * コンテンツの先頭に付加する関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-12-01-01 〜 T-12-03-02
 *
 * @see attachFrontmatter
 */
describe('attachFrontmatter', () => {
  /** project フィールドを引き継ぎ、AI 生成フィールドを付加する正常ケース。 */
  describe('When: 正常系', () => {
    let fm: ChatlogFrontmatter;

    beforeEach(() => {
      fm = new ChatlogFrontmatter('');
    });

    it('[Normal] T-12-01-01: 出力フロントマターに project: "ci-platform" が含まれる', () => {
      fm.set('project', 'ci-platform');
      fm.set('date', '2026-03-01');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('project: "ci-platform"'));
    });

    it('[Normal] T-12-01-02: 出力フロントマターに title・log_id・summary が含まれる', () => {
      fm.set('project', 'ci-platform');
      const segmentMeta = { title: 'Fix CI', log_id: 'abc1234', summary: 'CI fix' };
      const content = '## Summary\nFix CI';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('title: "Fix CI"'));
      assert(result.includes('log_id: "abc1234"'));
      assert(result.includes('summary: "CI fix"'));
    });

    it('[Normal] T-12-03-01: 出力が `---\\n` で始まりフロントマターブロックが `\\n---\\n` で終わる', () => {
      fm.set('project', 'test');
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.startsWith('---\n'));
      assert(result.includes('\n---\n'));
    });

    it('[Normal] T-12-03-02: コンテンツボディがフロントマターブロックの後に重複なく続く', () => {
      const segmentMeta = { title: 'T', log_id: 'x', summary: 'S' };
      const content = '## Summary\ntext';

      const result = attachFrontmatter(content, fm, segmentMeta);

      const contentOccurrences = result.split('## Summary\ntext').length - 1;
      assertEquals(contentOccurrences, 1);
    });
  });

  /** frontmatter が空の場合は AI 生成フィールドのみを含むエッジケース。 */
  describe('When: エッジケース', () => {
    let fm: ChatlogFrontmatter;

    beforeEach(() => {
      fm = new ChatlogFrontmatter('');
    });

    it('[Edge] T-12-02-01: 出力フロントマターが AI 生成フィールド（title・log_id・summary）のみを含む', () => {
      const segmentMeta = { title: 'Topic', log_id: 'aaabbbb', summary: 'Summary' };
      const content = '## Summary\nTopic content';

      const result = attachFrontmatter(content, fm, segmentMeta);

      assert(result.includes('title: "Topic"'));
      assert(result.includes('log_id: "aaabbbb"'));
      assert(result.includes('summary: "Summary"'));
      assertFalse(result.includes('project:'));
    });
  });
});

// ─── segmentChatlogs tests ────────────────────────────────────────────────────

/**
 * `segmentChatlogs` のユニットテストスイート。
 *
 * 複数ファイルをまとめて1回のAI呼び出しでセグメント分割する関数の
 * 正常系・異常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-SC-01-01, T-SC-05-01, T-SC-05-02, T-SCB-01-01 〜 T-SCB-05-02, T-SIO-LR-14, T-SIO-LR-19 〜 T-SIO-LR-25, T-SIO-LOG-01 〜 T-SIO-LOG-02
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
      const result = await segmentChatlogs([{ filePath: 'test.md', content: 'Body 1\nBody 2' }]);

      // assert
      assertEquals(result.get('test.md'), [
        { title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' },
        { title: 'Topic 2', summary: 'Summary 2', content: 'Body 2' },
      ]);
    });

    it('[Normal] T-SCB-01-01: 2ファイル入力でAIが有効なJSONを返すとき各ファイルのSegment[]をMapで返す', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'C1' },
        { filePath: 'b.md', content: 'C2' },
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
      assertEquals(result.get('a.md'), [{ title: 'T1', summary: 'S1', content: 'C1' }]);
      assertEquals(result.get('b.md'), [{ title: 'T2', summary: 'S2', content: 'C2' }]);
    });

    it('[Normal] T-SCB-01-02: 1ファイルでAIが12セグメントを返すとき先頭5件に制限される（MAX_SEGMENTS上限）', async () => {
      // arrange
      const content = Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n');
      const inputs = [{ filePath: 'big.md', content }];
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
      await segmentChatlogs([{ filePath: 'test.md', content: 'content' }], { model: 'claude-sonnet-4-6' });

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
      await segmentChatlogs([{ filePath: 'test.md', content: 'content' }]);

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
        { filePath: 'a.md', content: 'content a' },
        { filePath: 'b.md', content: 'content b' },
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
      const inputs = [{ filePath: 'a.md', content: 'content a' }];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
    });

    it('[Error] T-SCB-WL-01: AI が非ゼロ exit のとき logger.warn が呼ばれる', async () => {
      // arrange
      const inputs = [{ filePath: 'file-a.md', content: 'content a' }];
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
      const inputs = [{ filePath: 'file-b.md', content: 'content b' }];
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
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SCB-03-01: 1ファイル入力でも正常動作する', async () => {
      // arrange
      const inputs = [{ filePath: 'solo.md', content: 'C' }];
      const aiResult = [
        { filePath: 'solo.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('solo.md'), [{ title: 'T', summary: 'S', content: 'C' }]);
    });

    it('[Edge] T-SCB-04-01: AIが返す filePath が inputs にない場合無視され、inputs にある filePath は null になる', async () => {
      // arrange
      const inputs = [{ filePath: 'known.md', content: 'content' }];
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
      await segmentChatlogs([{ filePath: 'test.md', content }]);

      // assert — stdin には "1: line A\n2: line B" が含まれる
      assert(captured.instance !== null, 'mock was not instantiated');
      const written = captured.instance.capturedStdin.join('');
      assert(written.includes('1: line A\n2: line B'), `expected line-numbered content in stdin, got: ${written}`);
    });
  });

  /** 行番号範囲方式（_AiSegmentRange）: startLine/endLine でバッチ処理するケース。 */
  describe('When: 行番号範囲方式（_AiSegmentRange）', () => {
    it('[Normal] T-SIO-LR-19: 2ファイル入力でAIが {startLine,endLine} 返すとき各ファイルの Segment[] を Map で返す', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'a1\na2\na3' },
        { filePath: 'b.md', content: 'b1\nb2' },
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 2 }] },
        { filePath: 'b.md', segments: [{ title: 'BT', summary: 'BS', startLine: 1, endLine: 2 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('a.md')?.[0].content, 'a1\na2');
      assertEquals(result.get('b.md')?.[0].content, 'b1\nb2');
    });

    it('[Normal] T-SIO-LR-20: 各ファイルの行番号は独立（ファイルごとにリセット）', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'lineA1\nlineA2' },
        { filePath: 'b.md', content: 'lineB1\nlineB2\nlineB3' },
      ];
      const aiResult = [
        { filePath: 'a.md', segments: [{ title: 'AT', summary: 'AS', startLine: 1, endLine: 1 }] },
        { filePath: 'b.md', segments: [{ title: 'BT', summary: 'BS', startLine: 2, endLine: 3 }] },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('a.md')?.[0].content, 'lineA1');
      assertEquals(result.get('b.md')?.[0].content, 'lineB2\nlineB3');
    });

    it('[Error] T-SIO-LR-21: AIが非ゼロ exit のとき全ファイルが null の Map を返す', async () => {
      // arrange
      const inputs = [
        { filePath: 'a.md', content: 'content a' },
        { filePath: 'b.md', content: 'content b' },
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
      const inputs = [{ filePath: 'a.md', content: 'content a' }];
      const stdout = new TextEncoder().encode('not valid json');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs(inputs);

      // assert
      assertNull(result.get('a.md'));
    });

    it('[Edge] T-SIO-LR-23: AIが返す filePath が inputs にない場合無視され inputs 側は null になる', async () => {
      // arrange
      const inputs = [{ filePath: 'known.md', content: 'c' }];
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
      const inputs = [{ filePath: 'big.md', content: 'l1\nl2\nl3\nl4\nl5\nl6' }];
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
      const inputs = [{ filePath: 'a.md', content: 'content a' }];
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
      const inputs = [{ filePath: 'a.md', content: 'content a' }];
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
      const inputs = [{ filePath: 'a.md', content: 'C' }];
      const aiResult = [{ filePath: 'a.md', segments: [{ title: 'T', summary: 'S', startLine: 1, endLine: 1 }] }];
      const stdout = new TextEncoder().encode(JSON.stringify(aiResult));
      mockHandle = installCommandMock(makeDelayedSuccessMock(50, stdout));

      // act — timeoutMs 省略: デフォルト 120s >> 50ms 遅延
      const result = await segmentChatlogs(inputs);

      // assert
      assertEquals(result.get('a.md'), [{ title: 'T', summary: 'S', content: 'C' }]);
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
      await segmentChatlogs([{ filePath: 'test.md', content: 'single line' }]);

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
      const inputs = [{ filePath: 'known.md', content: 'content' }];
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
      const inputs = [{ filePath: 'known.md', content: 'content' }];
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

// ─── writeSegmentToFile tests ────────────────────────────────────────────────

/**
 * `writeSegmentToFile` のユニットテストスイート。
 *
 * 1セグメントをファイルに書き出すロジック（バックアップ・dryRun 動作）を検証する。
 *
 * テスト ID 範囲: T-SIO-WS-01 〜 T-SIO-WS-07
 *
 * @see writeSegmentToFile
 */
describe('writeSegmentToFile', () => {
  let outputDir: string;
  let stats: Stats;
  let filePath: string;
  let segment: { title: string; summary: string; content: string };
  let frontmatter: ChatlogFrontmatter;
  let hashFn: () => string;

  beforeEach(async () => {
    outputDir = await Deno.makeTempDir({ prefix: 'write-segment-test-' });
    stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
    filePath = `${outputDir}/sample.md`;
    segment = { title: 'Test Title', summary: 'Test Summary', content: 'Test Content' };
    frontmatter = new ChatlogEntry('---\nproject: test\n---\n# body').frontmatter;
    hashFn = () => 'testhash';
  });

  afterEach(async () => {
    await Deno.remove(outputDir, { recursive: true });
  });

  /** 正常系: ファイル書き込みと stats 更新を検証する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SIO-WS-01: dryRun=false で outputFileName のファイルが書き込まれ stats.success が 1 増える', async () => {
      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      assertEquals(stats.success, 1);
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await assertFileExist(expectedFile);
    });

    it('[Normal] T-SIO-WS-02: 既存ファイルがある場合 .old-01.md にバックアップされ新ファイルが書かれる', async () => {
      // arrange — 既存ファイルを事前作成
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'old content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      assertEquals(stats.success, 1);
      await assertFileExist(`${outputDir}/sample-01-testhash.old-01.md`);
      await assertFileExist(expectedFile);
    });

    it('[Normal] T-SIO-WS-04: 返されたパスが元の filePath とは異なる（入力ファイルを上書きしていない）', async () => {
      // act
      const returnedPath = await writeSegmentToFile(
        outputDir,
        filePath,
        0,
        segment,
        frontmatter,
        false,
        stats,
        hashFn,
      );

      // assert
      assertNotEquals(returnedPath, filePath);
      assertFalse(returnedPath.includes(filePath));
    });
  });

  /** 異常系: outputPath が filePath を含む場合は ChatlogError をスローする。 */
  describe('When: 異常系', () => {
    it('[Error] T-SIO-WS-05: outputPath が filePath を含むとき ChatlogError(ForbiddenOutput) をスローする', async () => {
      // filePath を outputDir として渡すと outputPath = `${filePath}/${outputFileName}` になり
      // outputPath.includes(filePath) が true になる
      const err = await assertRejects(
        () => writeSegmentToFile(filePath, filePath, 0, segment, frontmatter, false, stats, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'OverwriteInput');
    });
  });

  /** エッジケース: dryRun=true のとき stats が増えないことを検証する。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SIO-WS-03: dryRun=true のとき stats.success が増えない', async () => {
      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, true, stats, hashFn);

      // assert
      assertEquals(stats.success, 0);
    });

    it('[Edge] T-SIO-WS-06: old-98.md が存在するとき old-99.md にバックアップして成功する', async () => {
      // arrange — old-98.md を事前作成（これが最大 index → next=99）
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(`${outputDir}/sample-01-testhash.old-98.md`, 'backup 98 content');

      // act
      await writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn);

      // assert
      await assertFileExist(`${outputDir}/sample-01-testhash.old-99.md`);
      assertEquals(stats.success, 1);
    });

    it('[Error] T-SIO-WS-07: old-99.md が存在するとき TooManyBackups エラーをスローする', async () => {
      // arrange — old-99.md を事前作成（next=100 > 99 → エラー）
      const expectedFile = `${outputDir}/sample-01-testhash.md`;
      await Deno.writeTextFile(expectedFile, 'existing content');
      await Deno.writeTextFile(`${outputDir}/sample-01-testhash.old-99.md`, 'backup 99 content');

      // act / assert
      const err = await assertRejects(
        () => writeSegmentToFile(outputDir, filePath, 0, segment, frontmatter, false, stats, hashFn),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).subindex, 'IndexOverflow');
    });
  });
});

// ─── MAX_SEGMENTS tests ───────────────────────────────────────────────────────

/**
 * `MAX_SEGMENTS` 定数のユニットテスト。
 *
 * セグメント上限値の期待値を検証する。
 *
 * @see MAX_SEGMENTS
 */
describe('MAX_SEGMENTS', () => {
  it('[Normal] T-SIO-LR-01: MAX_SEGMENTS の値が 5 である', () => {
    assertEquals(MAX_SEGMENTS, 5);
  });
});
