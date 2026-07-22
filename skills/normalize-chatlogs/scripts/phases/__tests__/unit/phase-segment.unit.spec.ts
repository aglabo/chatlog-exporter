// src: skills/normalize-chatlogs/scripts/phases/__tests__/unit/phase-segment.unit.spec.ts
// @(#): phase-segment モジュールのユニットテスト
//       対象: phaseSegment
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// mock helpers
import {
  installCommandMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

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
 * @returns `Deno.Command` モックの stdout に渡す JSON 文字列
 */
const _makeAiResponse = (
  aiEntries: Array<{ filePath: string; segments: Array<{ title: string; startLine?: number; endLine?: number }> }>,
): string =>
  JSON.stringify(
    aiEntries.map((e) => ({
      filePath: e.filePath,
      segments: e.segments.map((s) => ({ summary: 'summary', ...s })),
    })),
  );

// ─── Tests

/**
 * `phaseSegment` のユニットテストスイート。
 *
 * キャッシュ済みエントリのスキップ、未キャッシュエントリのチャンク分割・AI呼び出し・
 * キャッシュ書き込み、AI失敗時の除外挙動を検証する。
 *
 * テスト ID 範囲: T-PP-01-01 〜 T-PP-07-01
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
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-PP-06-01: dryRun:true でもキャッシュには書き込まれる', async () => {
      // arrange
      const entry = _makeEntry('dryrun.md', 'content');
      const aiResponse = _makeAiResponse([
        { filePath: 'dryrun.md', segments: [{ title: 'T', startLine: 1, endLine: 1 }] },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(aiResponse)));

      // act
      await phaseSegment([entry], cache, { ..._baseConfig, dryRun: true }, 1);

      // assert
      const cached = cache.read(toCacheKey('dryrun.md'));
      assertEquals(cached.status, 'set');
      assertEquals(cached.segments?.[0]?.summary, 'summary');
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
