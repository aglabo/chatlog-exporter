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
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Test target
import { phaseSegment } from '../../phase-segment.ts';

// ─── Helpers
import { toCacheKey } from '../../../libs/cache-utils.ts';
// classes
import { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
import { BATCH_SIZE } from '../../../constants/normalize.constants.ts';
// types
import type { NormalizeCache } from '../../../types/cache.const.type.ts';

// ─── Internal Helpers

// constants

/** `phaseSegment` の `config` 引数に渡す最小構成（`model` は `runAI` のバリデーションを通す既定モデルを使用）。 */
const _baseConfig = { model: DEFAULT_AI_MODEL, dryRun: false } as const;

// functions

/** テスト用の `ChatlogEntry` を `filePath` と本文 `content` から生成する（frontmatterなし）。 */
const _makeEntry = (filePath: string, content: string): ChatlogEntry => new ChatlogEntry(content, { filePath });

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
 * キャッシュ書き込み、AI失敗時の除外挙動を検証する。
 *
 * テスト ID 範囲: T-PP-01-01 〜 T-PP-08-01
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
      // arrange — BATCH_SIZE(2) を超える3件の未キャッシュエントリ
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

      // assert — チャンク数は ceil(3/BATCH_SIZE) = 2
      assertEquals(counter.calls, Math.ceil(entries.length / BATCH_SIZE));
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
  });

  describe('When: 異常系', () => {
    it('[Error] T-PP-04-01: AI失敗（非ゼロexit）時、該当エントリは戻り値から除外されキャッシュに書き込まれない', async () => {
      // arrange
      const entry = _makeEntry('fail.md', 'content');
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await phaseSegment([entry], cache, _baseConfig, 1);

      // assert
      assertEquals(result, []);
      assertEquals(cache.read(toCacheKey('fail.md')), {});
    });

    it('[Error] T-PP-05-01: セグメントに startLine/endLine が欠けている場合も除外・未書き込み', async () => {
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
      assertEquals(cache.read(toCacheKey('incomplete.md')), {});
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
  });
});
