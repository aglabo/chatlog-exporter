// src: scripts/__tests__/unit/setfm-filter-review-entries.unit.spec.ts
// @(#): _filterReviewEntries Phase 3.5 フィルタのユニットテスト
//       対象: _filterReviewEntriesForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _filterReviewEntriesForTest as filterReviewEntries } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { CACHE_STATUSES } from '../../../../_scripts/types/cache-status.const.types.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogWorks` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/nr-cache-unit', import.meta.url).pathname,
);

// functions

/**
 * 書き込みをすべて noop にしたインメモリキャッシュを返す。
 * `readTextFile` が常に reject するため、全パスがキャッシュミス（`cache.read()` → `{}`）になる。
 *
 * @returns キャッシュ空の `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeEmptyCache = async (): Promise<ChatlogWorks<SetfmCache>> => {
  const cache = new ChatlogWorks<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readTextFile: () => Promise.reject(new Error('not found')),
    },
  });
  await cache.ready;
  return cache;
};

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス
 * @returns 指定されたパスを持つ最小 `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  return new ChatlogEntry('# body', { filePath });
};

// ─── Tests

/**
 * `_filterReviewEntries` の Phase 3.5 フィルタ動作ユニットテストスイート。
 *
 * `cache.read().status === 'need-review'` のエントリのみが通過することを検証する。
 *
 * テスト ID 範囲: T-SF-NR-01-01 〜 T-SF-NR-01-03
 *
 * @see _filterReviewEntriesForTest
 */
describe('_filterReviewEntries', () => {
  /** 正常系: need-review ステータスを持つエントリが通過する。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-NR-01-01: status === need-review → included', async () => {
      const filePath = '/path/to/need-review.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.NEED_REVIEW });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 1);
      assertEquals(result[0], entry);
    });
  });

  /** 異常系: reviewed ステータスを持つエントリは除外される。 */
  describe('When: 異常系', () => {
    it('[Error] T-SF-NR-01-02: status === reviewed → excluded', async () => {
      const filePath = '/path/to/reviewed.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.REVIEWED });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 0);
    });
  });

  /** エッジケース: status が undefined（キャッシュ書き込みなし）のエントリは除外される。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-NR-01-03: status === undefined → excluded', async () => {
      const filePath = '/path/to/no-status.md';
      const cache = await _makeEmptyCache();
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 0);
    });
  });
});
