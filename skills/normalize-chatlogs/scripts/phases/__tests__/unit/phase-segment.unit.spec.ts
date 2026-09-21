// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-segment.unit.spec.ts
// @(#): phase-segment モジュールのユニットテスト
//       対象: phaseSegment
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// mock helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
  wrapClaudeJson,
} from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// types
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';

// ─── Test target
import { phaseSegment } from '../../phase-segment.ts';

// ─── Helpers
import { toCacheKey } from '../../../libs/cache-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_cle-libs/constants/defaults.constants.ts';
import { DEFAULT_BATCH_SIZE, DEFAULT_MAX_BATCH_CHARS } from '../../../constants/normalize.constants.ts';
import { NORMALIZE_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { NormalizeCache } from '../../../types/cache.const.type.ts';

// ─── Internal Helpers

// constants

/**
 * `phaseSegment` の `config` 引数に渡す最小構成。
 *
 * `model` は `runAI` のバリデーションを通す既定モデル、チャンク上限は既定値を明示して
 * 「上限を指定しないケース」と「上限を検証するケース」の前提差を消す。
 */
const _baseConfig = {
  model: DEFAULT_AI_MODEL,
  dryRun: false,
  batchSize: DEFAULT_BATCH_SIZE,
  maxBatchChars: DEFAULT_MAX_BATCH_CHARS,
} as const;

/** `segmentChatlogs` の userPrompt が各ファイルの先頭に置くヘッダ行。捕捉した stdin からチャンク構成を復元する。 */
const _FILE_HEADER_PATTERN = /^File \d+: (.+)$/gm;

// functions

/** テスト用の `ChatlogEntry` を `filePath` と本文 `content` から生成する（frontmatterなし）。 */
const _makeEntry = (filePath: string, content: string): ChatlogEntry => new ChatlogEntry(content, { filePath });

/**
 * `content.length` がちょうど `length` になる 1 行のエントリを生成する。
 *
 * `ChatlogEntry` は本文末尾に `\n` を付与するため、素材は `length - 1` 文字で作る。
 * 累積文字数上限の判定は生の `content.length` で行われるので、長さを厳密に固定する。
 *
 * @param filePath - エントリの filePath
 * @param length   - 期待する `content.length`（1 以上）
 * @returns 指定長の本文を持つ `ChatlogEntry`
 */
const _makeSizedEntry = (filePath: string, length: number): ChatlogEntry =>
  _makeEntry(filePath, 'x'.repeat(length - 1));

/**
 * AI 応答 JSON（`segmentChatlogs` が期待する `{filePath, segments}[]` 形式）を文字列化する。
 *
 * @param aiEntries - `filePath` と `segments`（`startLine`/`endLine` を省略可能）の配列
 * @returns `Deno.Command` モックの stdout に渡す claude JSON エンベロープ文字列（`{"result":"<配列>"}`）
 */
const _makeAiResponse = (
  aiEntries: Array<{ filePath: string; segments: Array<{ title: string; startLine?: number; endLine?: number }> }>,
): string =>
  wrapClaudeJson(
    JSON.stringify(
      aiEntries.map((e) => ({
        filePath: e.filePath,
        segments: e.segments.map((s) => ({ summary: 'summary', ...s })),
      })),
    ),
  );

/**
 * `entries` の全 `filePath` に対して 1 セグメント（1行目のみ）を返す AI 応答を組み立てる。
 *
 * チャンク分割の検証ではどのチャンクに何が入るかだけが関心事なので、
 * 応答は全ファイル分をまとめて返す（`segmentChatlogs` は入力に無い `filePath` を無視する）。
 *
 * @param entries - 応答に含めるエントリ
 * @returns `Deno.Command` モックの stdout に渡す claude JSON エンベロープ文字列
 */
const _makeAiResponseFor = (entries: ChatlogEntry[]): string =>
  _makeAiResponse(
    entries.map((entry) => ({
      filePath: entry.filePath!,
      segments: [{ title: 'T', startLine: 1, endLine: 1 }],
    })),
  );

/**
 * `phaseSegment` の `config` 引数を二重上限つきで組み立てる。
 *
 * @param overrides - `batchSize` / `maxBatchChars` / `singleFile` の指定
 * @returns `_baseConfig` に上限設定を重ねた `config`
 */
const _makeChunkConfig = (
  overrides: { batchSize: number; maxBatchChars: number; singleFile?: boolean },
) => ({ ..._baseConfig, ...overrides });

/**
 * 累積文字数の境界ケース。本文 30 文字 x 2 件（累積 60 文字）に対し、上限が等しいとき束ね、
 * 1 文字下回るとき分割することを 1 組で固定する。
 */
const _CUMULATIVE_BOUNDARY_CASES: Array<{
  id: string;
  maxBatchChars: number;
  label: string;
  expected: string[][];
}> = [
  { id: 'T-NC-PSG-04-01', maxBatchChars: 60, label: '同一チャンクに収める', expected: [['a.md', 'b.md']] },
  { id: 'T-NC-PSG-04-02', maxBatchChars: 59, label: '分割する', expected: [['a.md'], ['b.md']] },
];

/**
 * 各 AI 呼び出しの stdin を捕捉し、プロンプトの `File <n>: <filePath>` 行から
 * チャンク構成（filePath の配列）を `recorded` に順番に積むモッククラスを生成する。
 *
 * `userPrompt` は args ではなく stdin へ書かれる（`run-ai.ts` の `_runViaCli`）ため、
 * 呼び出し回数だけを数える `makeCountingMock` では「どのファイルがどのチャンクに入ったか」を
 * 検証できない。`runConcurrent` に `concurrency = 1` を渡した場合、記録順はチャンクの構築順と一致する。
 *
 * @param stdout   - すべての呼び出しで返す claude JSON エンベロープ文字列
 * @param recorded - 呼び出しごとの filePath 配列を積む記録先（参照渡し、副作用あり）
 * @returns `installCommandMock` に渡す `DenoCommandLike`
 */
const _makeChunkRecordingMock = (stdout: string, recorded: string[][]): DenoCommandLike => {
  const _stdoutBytes = new TextEncoder().encode(stdout);

  return class extends BaseMockCommand {
    private prompt = '';

    override spawn() {
      const _decoder = new TextDecoder();
      return {
        stdin: {
          getWriter: () => ({
            write: (data: Uint8Array): Promise<void> => {
              this.prompt += _decoder.decode(data, { stream: true });
              return Promise.resolve();
            },
            close: (): Promise<void> => {
              recorded.push([...this.prompt.matchAll(_FILE_HEADER_PATTERN)].map((m) => m[1]));
              return Promise.resolve();
            },
          }),
        },
        output: () => this.makeOutput(),
      };
    }

    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
      return Promise.resolve({ success: true, code: 0, stdout: _stdoutBytes });
    }
  } as unknown as DenoCommandLike;
};

/**
 * 1回目に構築された `Deno.Command`（先頭チャンク）は rate limit エラー（stderr に "rate limit"）で
 * 失敗させ、2回目以降は `otherStdout` で成功させるモックを生成する。2回目以降の呼び出しに渡された
 * `opts.signal` を `captured` に記録する。
 *
 * `runConcurrent`（`withConcurrency`）は `limit` 個のワーカーを同時起動し、各ワーカーは
 * `idx++` で次のチャンクを同期的に取得するため、concurrency 以上のチャンク数があれば
 * 呼び出し順は構築順と一致する。先頭チャンクの throw で `ctl.abort()` が呼ばれたときに、
 * 実行中の他チャンクの `runAI` へ渡された signal がリレーされているかどうかを、
 * `captured.signal?.aborted` で判別するために使用する。
 */
const _makeRateLimitVsSignalCaptureMock = (
  otherStdout: string,
  captured: { signal?: AbortSignal },
): DenoCommandLike => {
  let _callCount = 0;

  return class extends BaseMockCommand {
    private readonly isRateLimitTarget: boolean;

    constructor(_cmd: string, opts: { args: string[]; signal?: AbortSignal }) {
      super();
      _callCount++;
      this.isRateLimitTarget = _callCount === 1;
      if (!this.isRateLimitTarget) { captured.signal = opts.signal; }
    }

    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
      if (this.isRateLimitTarget) {
        return Promise.resolve({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('rate limit exceeded'),
        });
      }
      return Promise.resolve({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode(otherStdout),
        stderr: new Uint8Array(),
      });
    }
  } as unknown as DenoCommandLike;
};

// ─── Tests

/**
 * `phaseSegment` のユニットテストスイート。
 *
 * キャッシュ済みエントリのスキップ、未キャッシュエントリのチャンク分割・AI呼び出し・
 * キャッシュ書き込み、セグメント取得失敗時の `status: 'retry'` 記録と戻り値からの除外を検証する。
 *
 * テスト ID 範囲: T-PP-01-01 〜 T-PP-13-01、T-NC-PSG-01-01 〜 T-NC-PSG-05-01
 *
 * @see phaseSegment
 */
describe('phaseSegment', () => {
  let mockHandle: CommandMockHandle;
  let tempDir: string;
  let cache: ChatlogCache<NormalizeCache>;

  beforeEach(async () => {
    tempDir = Deno.makeTempDirSync();
    cache = new ChatlogCache<NormalizeCache>('test-plan', tempDir, { yaml: '' });
    await cache.ready;
  });

  afterEach(() => {
    mockHandle?.restore();
    Deno.removeSync(tempDir, { recursive: true });
  });

  describe('When: 正常系', () => {
    it('[Normal] T-PP-01-01: キャッシュ済みエントリは AI 呼び出し無しで返る', async () => {
      // arrange
      const entry = _makeEntry('cached.md', 'content');
      await cache.write(toCacheKey('cached.md'), {
        status: 'set',
        segments: [{ title: 'T', summary: 'summary', startLine: 1, endLine: 1 }],
      });
      const counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock('[]', counter));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(counter.calls, 0);
      assertEquals(result, [entry]);
    });

    it('[Normal] T-PP-02-01: 未キャッシュエントリはチャンク分割されキャッシュに status:set で書き込まれる', async () => {
      // arrange — DEFAULT_BATCH_SIZE(4) 未満の3件の未キャッシュエントリ
      const entries = [
        _makeEntry('a.md', 'ca'),
        _makeEntry('b.md', 'cb'),
        _makeEntry('c.md', 'cc'),
      ];
      const aiResponse = _makeAiResponse([
        { filePath: 'a.md', segments: [{ title: 'TA', startLine: 1, endLine: 1 }] },
        { filePath: 'b.md', segments: [{ title: 'TB', startLine: 1, endLine: 1 }] },
        { filePath: 'c.md', segments: [{ title: 'TC', startLine: 1, endLine: 1 }] },
      ]);
      const counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock(aiResponse, counter));

      // act
      const result = await phaseSegment(entries, cache, _baseConfig, 1);

      // assert — チャンク数は ceil(3/DEFAULT_BATCH_SIZE) = 1
      assertEquals(counter.calls, Math.ceil(entries.length / DEFAULT_BATCH_SIZE));
      assertEquals(result.length, 3);
      for (const entry of entries) {
        const cached = cache.read(toCacheKey(entry.filePath!));
        assertEquals(cached.status, 'set');
        assertEquals(cached.segments?.length, 1);
        assertEquals(cached.segments?.[0]?.summary, 'summary');
      }
    });

    it('[Normal] T-PP-03-01: singleFile:true のとき chunkSize が1になる', async () => {
      // arrange
      const entries = [
        _makeEntry('x.md', 'cx'),
        _makeEntry('y.md', 'cy'),
      ];
      const aiResponse = _makeAiResponse([
        { filePath: 'x.md', segments: [{ title: 'TX', startLine: 1, endLine: 1 }] },
        { filePath: 'y.md', segments: [{ title: 'TY', startLine: 1, endLine: 1 }] },
      ]);
      const counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock(aiResponse, counter));

      // act
      await phaseSegment(entries, cache, { ..._baseConfig, singleFile: true }, 1);

      // assert — 1エントリ1チャンクなので呼び出し回数はエントリ数と同じ
      assertEquals(counter.calls, entries.length);
    });

    it("[Normal] T-PP-13-01: 同一チャンクに失敗ファイルが混在しても成功ファイルは status:'set' になる", async () => {
      // arrange — DEFAULT_BATCH_SIZE(4) 以内の2件を同一チャンクに載せ、応答には ok.md だけを含める
      const okEntry = _makeEntry('ok.md', 'content ok');
      const lostEntry = _makeEntry('lost.md', 'content lost');
      const aiResponse = _makeAiResponse([
        { filePath: 'ok.md', segments: [{ title: 'TOK', startLine: 1, endLine: 1 }] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      const result = await phaseSegment([okEntry, lostEntry], cache, _baseConfig, 1);

      // assert — 成功ファイルは set + segments、失敗ファイルは retry で戻り値から除外される
      assertEquals(result, [okEntry]);
      const okCached = cache.read(toCacheKey('ok.md'));
      assertEquals(okCached.status, NORMALIZE_CACHE_STATUSES.SET);
      assertEquals(okCached.segments?.length, 1);
      assertEquals(cache.read(toCacheKey('lost.md')).status, NORMALIZE_CACHE_STATUSES.RETRY);
    });
  });

  describe('When: 異常系', () => {
    it("[Error] T-PP-04-01: AI失敗（非ゼロexit）時、該当エントリは戻り値から除外され status:'retry' が書かれる", async () => {
      // arrange
      const entry = _makeEntry('fail.md', 'content');
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('fail.md')).status, NORMALIZE_CACHE_STATUSES.RETRY);
    });

    it("[Error] T-PP-05-01: セグメントに startLine/endLine が両方欠けている場合は除外され status:'retry' が書かれる", async () => {
      // arrange — startLine/endLine を省略した応答
      const entry = _makeEntry('incomplete.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'incomplete.md', segments: [{ title: 'T' }] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('incomplete.md')).status, NORMALIZE_CACHE_STATUSES.RETRY);
    });

    it("[Error] T-PP-09-01: AI 応答に当該 filePath が含まれないとき status:'retry' が書かれ戻り値から除外される", async () => {
      // arrange — 応答には入力に含まれない filePath だけがあり、対象ファイルは取りこぼされる
      const entry = _makeEntry('missing.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'ghost.md', segments: [{ title: 'T', startLine: 1, endLine: 1 }] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('missing.md')).status, NORMALIZE_CACHE_STATUSES.RETRY);
    });

    it("[Error] T-PP-11-01: セグメントの endLine だけが欠けている場合も除外され status:'retry' が書かれる", async () => {
      // arrange — startLine のみ与え endLine を省略した応答
      const entry = _makeEntry('partial.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'partial.md', segments: [{ title: 'T', startLine: 1 }] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('partial.md')).status, NORMALIZE_CACHE_STATUSES.RETRY);
    });

    it('[Error] T-PP-08-01: 並列実行中に一方のチャンクが RateLimit で失敗したとき他方のチャンクの signal が abort される', async () => {
      // arrange — singleFile:true で 2 チャンクに分割し、concurrency:2 で同時実行させる
      const entries = [
        _makeEntry('rate-limited.md', 'content a'),
        _makeEntry('other.md', 'content b'),
      ];
      const otherAiResponse = _makeAiResponse([
        { filePath: 'other.md', segments: [{ title: 'T', startLine: 1, endLine: 1 }] },
      ]);
      const captured: { signal?: AbortSignal } = {};
      mockHandle = installCommandMock(
        _makeRateLimitVsSignalCaptureMock(otherAiResponse, captured),
      );

      // act — withConcurrency は rate-limited.md 側の throw を受けて ctl.abort() を呼ぶ
      const error = await assertRejects(
        () => phaseSegment(entries, cache, { ..._baseConfig, singleFile: true }, 2),
        ChatlogError,
      );
      assertEquals(error.kind, 'AiError');

      // assert — other.md 側の runAI に渡された signal が abort されている（リレーの証明）
      assert(captured.signal !== undefined, 'signal was not captured — mock did not fire for other.md');
      assertEquals(captured.signal.aborted, true);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-PP-06-01: dryRun:true のとき AI は呼ばれずキャッシュにも書き込まれない', async () => {
      // arrange
      const entry = _makeEntry('dryrun.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'dryrun.md', segments: [{ title: 'T', startLine: 1, endLine: 1 }] },
      ]);
      const counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock(aiResponse, counter));

      // act
      const result = await phaseSegment([entry], cache, { ..._baseConfig, dryRun: true }, 1);

      // assert
      assertEquals(counter.calls, 0);
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('dryrun.md')), {});
    });

    it('[Edge] T-PP-07-01: 全エントリがキャッシュ済みのとき AI 呼び出し無しで即座に返る', async () => {
      // arrange
      const entries = [
        _makeEntry('p.md', 'cp'),
        _makeEntry('q.md', 'cq'),
      ];
      await Promise.all(entries.map((entry) =>
        cache.write(toCacheKey(entry.filePath!), {
          status: 'set',
          segments: [{ title: 'T', summary: 'summary', startLine: 1, endLine: 1 }],
        })
      ));
      const counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock('[]', counter));

      // act
      const result = await phaseSegment(entries, cache, _baseConfig, 1);

      // assert
      assertEquals(counter.calls, 0);
      assertEquals(result.length, 2);
    });

    it("[Edge] T-PP-10-01: AI が空セグメントを返したとき status:'set' ではなく 'retry' が書かれ segments が残らない", async () => {
      // arrange — segments が空配列の応答（現行実装では status:'set' + segments:[] が書かれてしまう）
      const entry = _makeEntry('empty.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'empty.md', segments: [] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert — 空セグメントを確定扱いせず再判定対象として残す
      assertEquals(result, []);
      const cached = cache.read(toCacheKey('empty.md'));
      assertEquals(cached.status, NORMALIZE_CACHE_STATUSES.RETRY);
      assertEquals(cached.segments, undefined);
    });

    it('[Edge] T-PP-12-01: dryRun:true のとき AI が失敗してもキャッシュには一切書き込まれない', async () => {
      // arrange — AI を失敗させても dryRun では _processChunk に到達しない
      const entry = _makeEntry('dryrun-fail.md', 'content');
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await phaseSegment([entry], cache, { ..._baseConfig, dryRun: true }, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('dryrun-fail.md')), {});
    });
  });

  /**
   * 件数上限 `batchSize` と累積文字数上限 `maxBatchChars` の「早い方」でチャンクを閉じる挙動のグループ。
   *
   * 呼び出し回数ではなく `_makeChunkRecordingMock` が stdin から復元したチャンク構成で照合する。
   * `concurrency` は常に 1 を渡し、記録順をチャンク構築順と一致させる。
   */
  describe('When: チャンク生成の二重上限', () => {
    describe('Then: batchSize（件数上限）で閉じる', () => {
      it('[Normal] T-NC-PSG-01-01: 件数上限が先に到達するとき件数どおりに分割する', async () => {
        // arrange — 1件10文字なので maxBatchChars(20000) には到達せず batchSize(2) だけが効く
        const entries = [
          _makeSizedEntry('a.md', 10),
          _makeSizedEntry('b.md', 10),
          _makeSizedEntry('c.md', 10),
        ];
        assertEquals(entries.map((entry) => entry.content.length), [10, 10, 10]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 2, maxBatchChars: 20000 }), 1);

        // assert
        assertEquals(recorded, [['a.md', 'b.md'], ['c.md']]);
      });

      it('[Normal] T-NC-PSG-01-02: 分割は入力順を保存し全エントリが過不足なく 1 回だけ現れる', async () => {
        // arrange — decision-records (cle-947)「バッチは入力順で決まり、1 エントリ 1 実行」の固定
        const entries = ['a', 'b', 'c', 'd', 'e'].map((name) => _makeSizedEntry(`${name}.md`, 30));
        assertEquals(entries.map((entry) => entry.content.length), [30, 30, 30, 30, 30]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 2, maxBatchChars: 70 }), 1);

        // assert — 欠落・重複・順序入れ替えのいずれも起きない
        assertEquals(recorded.flat(), ['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
      });
    });

    describe('Then: maxBatchChars（累積文字数上限）で閉じる', () => {
      it('[Normal] T-NC-PSG-02-01: 件数に余裕があっても累積文字数で分割する', async () => {
        // arrange — 30文字 x 4 件。batchSize(4) には収まるが 3 件目で 90 > 70 に達する
        const entries = ['a', 'b', 'c', 'd'].map((name) => _makeSizedEntry(`${name}.md`, 30));
        assertEquals(entries.map((entry) => entry.content.length), [30, 30, 30, 30]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 4, maxBatchChars: 70 }), 1);

        // assert
        assertEquals(recorded, [['a.md', 'b.md'], ['c.md', 'd.md']]);
      });
    });

    describe('Then: 単一ファイルが maxBatchChars を超える', () => {
      it('[Error] T-NC-PSG-03-01: 超過ファイル 1 件だけのとき空チャンクを作らない', async () => {
        // arrange — 120 文字は maxBatchChars(50) を単独で超える（上限を満たせない前提違反）
        const entries = [_makeSizedEntry('big.md', 120)];
        assertEquals(entries.map((entry) => entry.content.length), [120]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 4, maxBatchChars: 50 }), 1);

        // assert — 単独チャンクへ降格し、空チャンク（AI への空プロンプト）は生まれない
        assertEquals(recorded, [['big.md']]);
      });

      it('[Error] T-NC-PSG-03-02: 蓄積済みチャンクの後に超過ファイルが来ると直前チャンクを閉じる', async () => {
        // arrange — small(10) の後に単独超過の big(120) が続く
        const entries = [_makeSizedEntry('small.md', 10), _makeSizedEntry('big.md', 120)];
        assertEquals(entries.map((entry) => entry.content.length), [10, 120]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 4, maxBatchChars: 50 }), 1);

        // assert — small を巻き込まず big だけを単独チャンクにする
        assertEquals(recorded, [['small.md'], ['big.md']]);
      });
    });

    describe('Then: 境界値', () => {
      for (const tc of _CUMULATIVE_BOUNDARY_CASES) {
        it(`[Edge] ${tc.id}: 30 文字 x 2 件 / maxBatchChars=${tc.maxBatchChars} → ${tc.label}`, async () => {
          // arrange — 累積 60 文字に対して上限を 60 / 59 と振り、境界の両側を固定する
          const entries = ['a', 'b'].map((name) => _makeSizedEntry(`${name}.md`, 30));
          assertEquals(entries.map((entry) => entry.content.length), [30, 30]);
          const recorded: string[][] = [];
          mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

          // act
          await phaseSegment(
            entries,
            cache,
            _makeChunkConfig({ batchSize: 4, maxBatchChars: tc.maxBatchChars }),
            1,
          );

          // assert
          assertEquals(recorded, tc.expected);
        });
      }

      it('[Edge] T-NC-PSG-04-03: maxBatchChars が 0 のとき無制限として扱う', async () => {
        // arrange — 50000 文字 x 4 件。0 を上限として数えると 1 件ごとに分割される
        const entries = ['a', 'b', 'c', 'd'].map((name) => _makeSizedEntry(`${name}.md`, 50000));
        assertEquals(entries.map((entry) => entry.content.length), [50000, 50000, 50000, 50000]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(entries, cache, _makeChunkConfig({ batchSize: 4, maxBatchChars: 0 }), 1);

        // assert — 文字数では閉じず batchSize(4) いっぱいまで 1 チャンクに収まる
        assertEquals(recorded, [['a.md', 'b.md', 'c.md', 'd.md']]);
      });

      it('[Edge] T-NC-PSG-04-04: entries が空配列のとき AI を呼ばない', async () => {
        // arrange
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor([]), recorded));

        // act
        const result = await phaseSegment([], cache, _makeChunkConfig({ batchSize: 4, maxBatchChars: 20000 }), 1);

        // assert — 空チャンクが作られないので AI 呼び出しは 0 回
        assertEquals(recorded, []);
        assertEquals(result, []);
      });
    });

    describe('Then: singleFile が両上限より優先される', () => {
      it('[State] T-NC-PSG-05-01: singleFile:true のとき両上限に関係なく 1 件ずつになる', async () => {
        // arrange — batchSize(4) も maxBatchChars(0=無制限) も束ねる側に倒れている条件
        const entries = ['a', 'b'].map((name) => _makeSizedEntry(`${name}.md`, 10));
        assertEquals(entries.map((entry) => entry.content.length), [10, 10]);
        const recorded: string[][] = [];
        mockHandle = installCommandMock(_makeChunkRecordingMock(_makeAiResponseFor(entries), recorded));

        // act
        await phaseSegment(
          entries,
          cache,
          _makeChunkConfig({ batchSize: 4, maxBatchChars: 0, singleFile: true }),
          1,
        );

        // assert — singleFile が batchSize を 1 に上書きするため 1 件 1 チャンクになる
        assertEquals(recorded, [['a.md'], ['b.md']]);
      });
    });
  });
});
