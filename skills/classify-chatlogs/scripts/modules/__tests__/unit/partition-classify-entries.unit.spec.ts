// src: scripts/modules/__tests__/unit/partition-classify-entries.unit.spec.ts
// @(#): partitionByPreclassify の単体テスト
//       対象: partitionByPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { partitionByPreclassify } from '../../partition-classify-entries.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';
// constants
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Tests

/**
 * `partitionByPreclassify` のユニットテストスイート。
 *
 * AI なし事前分類 → キャッシュ有無による REMAINING の振り分けを検証する。
 *
 * テスト ID 範囲: T-CL-PCE-01 〜 T-CL-PCE-05
 *
 * @see partitionByPreclassify
 */
describe('partitionByPreclassify', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCE-01: preclassify で全件 MOVE/SKIP に解決する → uncached は空', async () => {
      // frontmatter に project あり、パスは proj-a サブディレクトリ外 → MOVE
      const _entryMove = _makeEntry('/tmp/input/move-test.md', { project: 'proj-a' }, '');
      // frontmatter に project あり、パスが proj-a サブディレクトリ内 → SKIP
      const _entrySkip = _makeEntry('/tmp/input/proj-a/skip-test.md', { project: 'proj-a' }, '');

      const _cache = await _makeEmptyClassifyCache();

      const result = await partitionByPreclassify([_entryMove, _entrySkip], _cache);

      assertEquals(result.uncached, []);
      assertEquals(_cache.read(_entryMove.filePath!).action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(_cache.read(_entrySkip.filePath!).action, CLASSIFY_ACTIONS.SKIP);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCE-02: REMAINING エントリのファイルがキャッシュ済み → uncached には含まれず cache に project/action: MOVEBYAI が書き込まれる', async () => {
      const _entry = _makeEntry('/tmp/input/cached.md', {}, 'a'.repeat(100));
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entry.filePath!, { project: 'proj-a', confidence: 0.95, reason: 'cached decision' });

      const result = await partitionByPreclassify([_entry], _cache);

      assertEquals(result.uncached, []);
      assertEquals(_cache.read(_entry.filePath!).action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(_cache.read(_entry.filePath!).project, 'proj-a');
    });

    it('[Edge] T-CL-PCE-03: REMAINING エントリが一部のみキャッシュ済み → cache済み分は cache 経由で MOVEBYAI, 未cache分は uncached に含まれる', async () => {
      const _entryCached = _makeEntry('/tmp/input/cached2.md', {}, 'a'.repeat(100));
      const _entryUncached = _makeEntry('/tmp/input/uncached.md', {}, 'b'.repeat(100));
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_entryCached.filePath!, { project: 'proj-a', confidence: 0.9, reason: 'cached' });

      const result = await partitionByPreclassify([_entryCached, _entryUncached], _cache);

      assertEquals(_cache.read(_entryCached.filePath!).action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(_cache.read(_entryCached.filePath!).project, 'proj-a');
      assertEquals(result.uncached.length, 1);
      assertEquals(result.uncached[0].filePath, _entryUncached.filePath);
    });

    it('[Edge] T-CL-PCE-04: entries Map に渡した全ファイルの filePath→ChatlogEntry が格納される', async () => {
      const _entryA = _makeEntry('/tmp/input/a.md', { project: 'proj-a' }, '');
      const _entryB = _makeEntry('/tmp/input/uncached.md', {}, 'b'.repeat(100));
      const _cache = await _makeEmptyClassifyCache();

      const result = await partitionByPreclassify([_entryA, _entryB], _cache);

      assertEquals(result.entries, [_entryA, _entryB]);
    });

    it('[Edge] T-CL-PCE-05: action: ERROR 済みの読み込み失敗エントリ（空内容）を含む → entries には含まれるが、事前分類で上書きされず action: ERROR のまま維持され uncached にも含まれない', async () => {
      const _errorEntry = new ChatlogEntry('', { filePath: '/tmp/input/error.md' });
      const _cache = await _makeEmptyClassifyCache();
      await _cache.write(_errorEntry.filePath!, { action: CLASSIFY_ACTIONS.ERROR, reason: 'load failed' });

      const result = await partitionByPreclassify([_errorEntry], _cache);

      assertEquals(result.entries, [_errorEntry]);
      assertEquals(result.uncached, []);
      assertEquals(_cache.read(_errorEntry.filePath!).action, CLASSIFY_ACTIONS.ERROR);
    });
  });
});
