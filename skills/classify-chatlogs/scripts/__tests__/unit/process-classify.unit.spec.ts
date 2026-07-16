// src: scripts/__tests__/unit/process-classify.unit.spec.ts
// @(#): processClassify のユニットテスト
//       対象: processClassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processClassify } from '../../classify-chatlogs.ts';

// ─── Helpers
import { _makeClassifyChatlogEntry, _makeEmptyClassifyCache } from '../_helpers/classify-test-helpers.ts';
// classes
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { ClassifyPartition, ProjectDicEntry } from '../../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../types/classify.types.ts';

// ─── Internal Helpers
import {
  installCommandMock,
  makeCountingMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

// constants
/** プロジェクト辞書（AI を呼び出さないテスト用に proj-a のみ定義）。 */
const _PROJECTS: ProjectDicEntry = { 'proj-a': {} };

/** processClassify に渡す最小 config。 */
const _CONFIG = { chunkSize: 10, concurrency: 1, model: 'opus' };

// ─── Tests

/**
 * `processClassify` のユニットテストスイート。
 *
 * `ClassifyPartition` を受け取り、`uncached` のみを AI 分類に委譲し、
 * `resolved`・`cached`・AI 分類結果を結合して返す contract を検証する。
 * `partitionClassifyEntries` 側の責務（preclassify・キャッシュ振り分け）は検証しない。
 *
 * テスト ID 範囲: T-CL-PC-01 〜 T-CL-PC-02
 *
 * @see processClassify
 */
describe('processClassify', () => {
  /**
   * `resolved`/`cached` はそのまま結果に含まれ、AI 分類は行われないケース。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PC-01: uncached が空 → resolved と cached がそのまま結合されて返る', async () => {
      const _resolvedEntry = {
        file: new ChatlogEntry('', { filePath: '/tmp/input/resolved.md' }),
        action: CLASSIFY_ACTIONS.MOVE,
      };
      const _cachedEntry = {
        file: new ChatlogEntry('', { filePath: '/tmp/input/cached.md' }),
        project: 'proj-a',
        action: CLASSIFY_ACTIONS.MOVEBYAI,
      };
      const _partition: ClassifyPartition = { resolved: [_resolvedEntry], cached: [_cachedEntry], uncached: [] };
      const _cache = await _makeEmptyClassifyCache();

      const result = await processClassify(_partition, _PROJECTS, _CONFIG, _cache);

      assertEquals(result, [_resolvedEntry, _cachedEntry]);
    });
  });

  /**
   * `uncached` の件数分だけ `classifyByAI` に委譲され、claude CLI が呼び出されることを検証する。
   */
  describe('When: uncached エントリの AI 分類委譲', () => {
    let mockHandle: CommandMockHandle;
    let counter: { calls: number };

    afterEach(() => {
      mockHandle.restore();
    });

    it('[Normal] T-CL-PC-02: uncached に1件 → claude CLI が1回呼び出され、AI 分類結果が結果に含まれる', async () => {
      counter = { calls: 0 };
      const response = JSON.stringify([
        { file: 'uncached.md', project: 'proj-a', confidence: 0.8, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeCountingMock(response, counter));

      const _entryUncached = _makeClassifyChatlogEntry('uncached.md');
      const _partition: ClassifyPartition = {
        resolved: [],
        cached: [],
        uncached: [{ file: _entryUncached, action: CLASSIFY_ACTIONS.REMAINING }],
      };
      const _cache = await _makeEmptyClassifyCache();

      const result = await processClassify(_partition, _PROJECTS, _CONFIG, _cache);

      assertEquals(counter.calls, 1);
      assertEquals(result.length, 1);
      assertEquals(result[0].action, CLASSIFY_ACTIONS.MOVEBYAI);
    });
  });
});
