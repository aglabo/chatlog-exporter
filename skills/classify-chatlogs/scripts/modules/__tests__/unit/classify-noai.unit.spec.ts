// src: scripts/modules/__tests__/unit/classify-noai.unit.spec.ts
// @(#): preClassify / processPreclassify の単体テスト
//       対象: preClassify / processPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { preClassify, processPreclassify } from '../../classify-noai.ts';

// ─── Helpers
// types
import type { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// constants
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `preClassify` のユニットテストスイート。
 *
 * frontmatter の `project` フィールドと本文長に基づく事前分類ロジックを検証する。
 * `ChatlogEntry` と `cache` を受け取り、判定結果を `cache.write` に書き込む。
 *
 * テスト ID 範囲: T-CL-PRE-01 〜 T-CL-PRE-05
 *
 * @see preClassify
 */
describe('preClassify', () => {
  /**
   * 正常系: frontmatter の `project` フィールドが存在する場合の分岐テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PRE-01: project フィールドあり + 既に正しいディレクトリ内 → cache: action=skip, project', async () => {
      const _filePath = '/tmp/chatlogs/app1/test.md';
      const _entry = _makeEntry(_filePath, { project: 'app1' }, '本文テキスト');
      const cache = await _makeEmptyClassifyCache();

      await preClassify(_entry, cache);

      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(cache.read(_filePath).project, 'app1');
    });

    it('[Normal] T-CL-PRE-02: project フィールドあり + ディレクトリが違う → cache: action=move, project', async () => {
      const _filePath = '/tmp/chatlogs/test.md';
      const _entry = _makeEntry(_filePath, { project: 'app1' }, '本文テキスト');
      const cache = await _makeEmptyClassifyCache();

      await preClassify(_entry, cache);

      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(cache.read(_filePath).project, 'app1');
    });

    it('[Normal] T-CL-PRE-03: project フィールドなし + hasMeta=false + 短い → cache: project=FALLBACK_PROJECT, action=move', async () => {
      const _filePath = '/tmp/chatlogs/test.md';
      const _entry = _makeEntry(_filePath, {}, 'short');
      const cache = await _makeEmptyClassifyCache();

      await preClassify(_entry, cache);

      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(cache.read(_filePath).project, FALLBACK_PROJECT);
    });

    it('[Normal] T-CL-PRE-04: project フィールドなし + hasMeta=true → cache: action=remaining（AI 処理対象）', async () => {
      const _filePath = '/tmp/chatlogs/test.md';
      const _entry = _makeEntry(
        _filePath,
        { title: 'Some Title', category: 'development' },
        'short',
      );
      const cache = await _makeEmptyClassifyCache();

      await preClassify(_entry, cache);

      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.REMAINING);
    });

    it('[Normal] T-CL-PRE-05: project フィールドなし + hasMeta=false + 長い → cache: action=remaining', async () => {
      const _filePath = '/tmp/chatlogs/test.md';
      const _longContent = 'a'.repeat(100);
      const _entry = _makeEntry(_filePath, {}, _longContent);
      const cache = await _makeEmptyClassifyCache();

      await preClassify(_entry, cache);

      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.REMAINING);
    });
  });
});

/**
 * `processPreclassify` のユニットテストスイート。
 *
 * `ChatlogEntry[]` と `cache` を渡し、各エントリに `preClassify` を適用した
 * 結果が `cache` に書き込まれることを検証する。
 *
 * テスト ID 範囲: T-CL-PCL-01 〜 T-CL-PCL-03
 *
 * @see processPreclassify
 */
describe('processPreclassify', () => {
  /**
   * 正常系: project あり・なし・短すぎるファイルが混在する場合の分類結果テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PCL-01: project あり・project なし・短すぎる混在 → それぞれ適切な action が cache に書き込まれる', async () => {
      const _pathWithProject = '/tmp/dir/app1/a.md';
      const _pathShort = '/tmp/dir/b.md';
      const _pathLong = '/tmp/dir/c.md';
      const _entryWithProject = _makeEntry(_pathWithProject, { project: 'app1' }, '本文');
      const _entryShort = _makeEntry(_pathShort, {}, 'x');
      const _entryLong = _makeEntry(_pathLong, {}, 'a'.repeat(100));
      const cache = await _makeEmptyClassifyCache();

      const _buffer: ChatlogEntry[] = [_entryWithProject, _entryShort, _entryLong];

      const _result = await processPreclassify(_buffer, cache);

      assertEquals(_result.length, 3);
      assertEquals(cache.read(_pathWithProject).action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(cache.read(_pathWithProject).project, 'app1');
      assertEquals(cache.read(_pathShort).action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(cache.read(_pathShort).project, FALLBACK_PROJECT);
      assertEquals(cache.read(_pathLong).action, CLASSIFY_ACTIONS.REMAINING);
    });
  });

  /**
   * エッジケース: 単一エントリのみの場合の動作テスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PCL-03: 単一エントリ（project あり）を渡す → cache に action=skip が書き込まれる', async () => {
      const _filePath = '/tmp/dir/app1/a.md';
      const _entry = _makeEntry(_filePath, { project: 'app1' }, '本文');
      const _buffer: ChatlogEntry[] = [_entry];
      const cache = await _makeEmptyClassifyCache();

      const _result = await processPreclassify(_buffer, cache);

      assertEquals(_result.length, 1);
      assertEquals(cache.read(_filePath).action, CLASSIFY_ACTIONS.SKIP);
      assertEquals(cache.read(_filePath).project, 'app1');
    });
  });
});
