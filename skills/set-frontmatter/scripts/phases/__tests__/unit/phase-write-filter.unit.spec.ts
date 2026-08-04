// src: scripts/phases/__tests__/unit/phase-write-filter.unit.spec.ts
// @(#): filterWriteEntry Phase 4 書き込み判定predicate のユニットテスト
//       対象: filterWriteEntry
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
import { filterWriteEntry } from '../../phase-write.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../../types/cache.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fw-cache-unit', import.meta.url).pathname,
);

// functions

/**
 * 書き込みをすべて noop にしたインメモリキャッシュを返す。
 * `readTextFile` が常に reject するため、全パスがキャッシュミス（`cache.read()` → `{}`）になる。
 *
 * @returns キャッシュ空の `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeEmptyCache = async (): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readTextFile: () => Promise.reject(new Error('not found')),
    },
  });
  await cache.ready;
  return cache;
};

// ─── Tests

/**
 * `filterWriteEntry` の Phase 4 書き込み判定 predicate ユニットテストスイート。
 *
 * `review=false` では `frontmatter` と `reviewed` で true を返し、
 * `review=true` では `reviewed` のみ true を返すことを検証する。
 *
 * テスト ID 範囲: T-SF-FWE-01 〜 T-SF-FWE-06
 *
 * @see filterWriteEntry
 */
describe('filterWriteEntry', () => {
  /** 正常系: 書き込み対象となるステータスで true を返す。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SF-FWE-01: review=false, status=frontmatter → true', async () => {
      const filePath = '/path/to/frontmatter.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.FRONTMATTER });

      const result = filterWriteEntry(filePath, cache, false);

      assertEquals(result, true);
    });

    it('[Normal] T-SF-FWE-02: review=false, status=reviewed → true', async () => {
      const filePath = '/path/to/reviewed.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.REVIEWED });

      const result = filterWriteEntry(filePath, cache, false);

      assertEquals(result, true);
    });

    it('[Normal] T-SF-FWE-03: review=true, status=reviewed → true', async () => {
      const filePath = '/path/to/reviewed.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.REVIEWED });

      const result = filterWriteEntry(filePath, cache, true);

      assertEquals(result, true);
    });
  });

  /** 異常系: 書き込み対象外のステータスで false を返す。 */
  describe('When: 異常系', () => {
    it('[Error] T-SF-FWE-04: review=false, status=review-failed → false', async () => {
      const filePath = '/path/to/review-failed.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.REVIEW_FAILED });

      const result = filterWriteEntry(filePath, cache, false);

      assertEquals(result, false);
    });

    it("[Error] T-SF-FWE-05: review=false, status='' → false", async () => {
      const filePath = '/path/to/empty-status.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.EMPTY });

      const result = filterWriteEntry(filePath, cache, false);

      assertEquals(result, false);
    });

    it('[Error] T-SF-FWE-06: review=true, status=frontmatter → false', async () => {
      const filePath = '/path/to/frontmatter.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: SETFM_CACHE_STATUSES.FRONTMATTER });

      const result = filterWriteEntry(filePath, cache, true);

      assertEquals(result, false);
    });
  });
});
