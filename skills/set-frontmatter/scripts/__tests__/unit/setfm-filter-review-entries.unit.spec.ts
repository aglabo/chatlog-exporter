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
 * `written` と `reviewed` を除いた全ステータス（`need-review`、`set-types`、`''`、キャッシュミス）が
 * レビュー対象として通過することを検証する。
 *
 * テスト ID 範囲: T-SF-NR-01-01 〜 T-SF-NR-01-07
 *
 * @see _filterReviewEntriesForTest
 */
describe('_filterReviewEntries', () => {
  /** 正常系: レビュー対象ステータスを持つエントリが通過する。 */
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

    it('[Normal] T-SF-NR-01-04: status === set-types → included', async () => {
      const filePath = '/path/to/set-types.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.SET_TYPES });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 1);
      assertEquals(result[0], entry);
    });

    it("[Normal] T-SF-NR-01-05: status === '' (EMPTY) → included", async () => {
      const filePath = '/path/to/empty-status.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.EMPTY });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 1);
      assertEquals(result[0], entry);
    });
  });

  /** 異常系: 完了済みステータスを持つエントリは除外される。 */
  describe('When: 異常系', () => {
    it('[Error] T-SF-NR-01-02: status === reviewed → excluded', async () => {
      const filePath = '/path/to/reviewed.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.REVIEWED });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 0);
    });

    it('[Error] T-SF-NR-01-06: status === written → excluded', async () => {
      const filePath = '/path/to/written.md';
      const cache = await _makeEmptyCache();
      await cache.write(filePath, { status: CACHE_STATUSES.WRITTEN });
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 0);
    });
  });

  /** エッジケース: status が undefined（キャッシュ書き込みなし）のエントリはレビュー対象に含まれる。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-NR-01-03: status === undefined (cache miss) → included', async () => {
      const filePath = '/path/to/no-status.md';
      const cache = await _makeEmptyCache();
      const entry = _makeEntry(filePath);

      const result = filterReviewEntries([entry], cache);

      assertEquals(result.length, 1);
      assertEquals(result[0], entry);
    });

    it('[Edge] T-SF-NR-01-07: entries 空配列 → 結果も空配列', async () => {
      const cache = await _makeEmptyCache();

      const result = filterReviewEntries([], cache);

      assertEquals(result.length, 0);
    });
  });

  /**
   * targetEntries（skipEntries + generateEntries）を渡したときの動作。
   *
   * `_splitSkip` によって skipEntries に分類された need-review エントリも
   * targetEntries 全体を渡すことでレビュー対象に含まれることを検証する。
   *
   * テスト ID 範囲: T-SF-NR-02-01 〜 T-SF-NR-02-02
   */
  describe('When: targetEntries（skipEntries + generateEntries 合計）を渡す', () => {
    it('[Normal] T-SF-NR-02-01: need-review（skipEntries 由来）と set-types（generateEntries 由来）の混在 → 両方 included', async () => {
      const skipPath = '/path/to/skip-need-review.md';
      const genPath = '/path/to/gen-set-types.md';
      const cache = await _makeEmptyCache();
      await cache.write(skipPath, { status: CACHE_STATUSES.NEED_REVIEW });
      await cache.write(genPath, { status: CACHE_STATUSES.SET_TYPES });
      const skipEntry = _makeEntry(skipPath);
      const genEntry = _makeEntry(genPath);

      // targetEntries = skipEntries + generateEntries
      const result = filterReviewEntries([skipEntry, genEntry], cache);

      assertEquals(result.length, 2);
    });

    it('[Normal] T-SF-NR-02-02: need-review（skipEntries 由来）と reviewed（skipEntries 由来）の混在 → need-review のみ included', async () => {
      const needReviewPath = '/path/to/need-review.md';
      const reviewedPath = '/path/to/reviewed.md';
      const cache = await _makeEmptyCache();
      await cache.write(needReviewPath, { status: CACHE_STATUSES.NEED_REVIEW });
      await cache.write(reviewedPath, { status: CACHE_STATUSES.REVIEWED });
      const needReviewEntry = _makeEntry(needReviewPath);
      const reviewedEntry = _makeEntry(reviewedPath);

      // targetEntries = skipEntries（need-review + reviewed）
      const result = filterReviewEntries([needReviewEntry, reviewedEntry], cache);

      assertEquals(result.length, 1);
      assertEquals(result[0], needReviewEntry);
    });
  });
});
