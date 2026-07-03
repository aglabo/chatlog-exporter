// src: scripts/__tests__/unit/setfm-filter-entries.unit.spec.ts
// @(#): _filterEntries 事前フィルタリングのユニットテスト
//       対象: _filterEntriesForTest
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words Setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _filterEntriesForTest as filterEntries } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../../_scripts/classes/ChatlogWorks.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogWorks` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-cache-fe-unit', import.meta.url).pathname,
);

// functions

/**
 * 書き込みをすべて noop にしたインメモリキャッシュを返す。
 * `glob` が空リストを返すことで全パスがキャッシュミス（`cache.read()` → `{}`）になる。
 *
 * `subDir` に絶対パスを渡すことで `GlobalConfig.getInstance()` を呼ばずに初期化できる。
 * `mkdir` は noop なのでディレクトリは作成されない。
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
 * `cache.read(filePath)` が指定の `data` を返すキャッシュを返す。
 * `glob` がファイルを返し `readTextFile` が JSON を返すことで、ready 完了時にキャッシュがヒット状態になる。
 *
 * @param filePath - キャッシュキーとなるファイルパス
 * @param data - `cache.read(filePath)` に返させる `SetfmCache` データ
 * @returns 指定ファイルにキャッシュヒットする `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCacheWithHit = async (
  filePath: string,
  data: Partial<SetfmCache>,
): Promise<ChatlogWorks<SetfmCache>> => {
  const cache = new ChatlogWorks<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readTextFile: (_path: string) => Promise.resolve(JSON.stringify(data)),
      glob: (_pattern: string) => Promise.resolve([filePath]),
    },
  });
  await cache.ready;
  return cache;
};

/**
 * テスト用 `ChatlogEntry` を生成する。
 *
 * @param filePath - エントリのファイルパス
 * @param fmLines  - frontmatter ブロック内の YAML 行配列（--- を除く）
 * @param body     - 本文テキスト
 * @returns 指定されたパスと frontmatter を持つ `ChatlogEntry`
 */
const _makeEntry = (filePath: string, fmLines: string[], body: string): ChatlogEntry => {
  const text = ['---', ...fmLines, '---', '', body].join('\n');
  return new ChatlogEntry(text, { filePath });
};

/** 全6フィールド充足エントリ: type/category/title/summary/topics[1]/tags[1] */
const _makeFullEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'summary: Test summary text',
    'topics:',
    '  - typescript',
    'tags:',
    '  - lang:typescript',
  ], '# Full entry body');

/** フィールド不足エントリ: topics なし */
const _makeMissingTopicsEntry = (filePath: string): ChatlogEntry =>
  _makeEntry(filePath, [
    'type: research',
    'category: development',
    'title: Test Title',
    'summary: Test summary text',
    'tags:',
    '  - lang:typescript',
  ], '# Missing topics body');

// ─── Tests

describe('_filterEntries', () => {
  /**
   * `_filterEntries` の skip/generate 分割ロジックを検証する。
   *
   * テスト ID 範囲: T-SF-FE-01 〜 T-SF-FE-05
   *
   * @see _filterEntriesForTest
   */
  describe('When: status 未設定（cache MISS）', () => {
    it('[Normal] T-SF-FE-01-01: status 未設定エントリ → targetEntries に入る（skipEntries は空）', async () => {
      const entry = _makeFullEntry('/path/to/full.md');
      const cache = await _makeEmptyCache();

      const { skipEntries, targetEntries } = filterEntries([entry], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });
  });

  describe('When: status=reviewed キャッシュあり', () => {
    it('[Normal] T-SF-FE-02-01: status=reviewed キャッシュ → skipEntries に入る', async () => {
      const filePath = '/path/to/reviewed.md';
      const entry = _makeMissingTopicsEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: 'reviewed' });

      const { skipEntries, targetEntries } = filterEntries([entry], cache);

      assertEquals(skipEntries.length, 1);
      assertEquals(targetEntries.length, 0);
    });
  });

  describe('When: フィールド不足（cache MISS）', () => {
    it('[Normal] T-SF-FE-03-01: フィールド不足エントリ（cache miss）→ targetEntries に入る', async () => {
      const entry = _makeMissingTopicsEntry('/path/to/incomplete.md');
      const cache = await _makeEmptyCache();

      const { skipEntries, targetEntries } = filterEntries([entry], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });
  });

  describe('When: 空配列入力（境界値）', () => {
    it('[Edge] T-SF-FE-04-01: 空配列 entries → skipEntries も targetEntries も空', async () => {
      const cache = await _makeEmptyCache();

      const { skipEntries, targetEntries } = filterEntries([], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 0);
    });
  });

  describe('When: skip と target の混在', () => {
    it('[Edge] T-SF-FE-05-01: reviewed 済みと未レビューの混在 → 正しく分割', async () => {
      const reviewedFilePath = '/path/to/reviewed.md';
      const reviewedEntry = _makeFullEntry(reviewedFilePath);
      const incompleteEntry = _makeMissingTopicsEntry('/path/to/incomplete.md');
      const cache = await _makeCacheWithHit(reviewedFilePath, { status: 'reviewed' });

      const { skipEntries, targetEntries } = filterEntries([reviewedEntry, incompleteEntry], cache);

      assertEquals(skipEntries.length, 1);
      assertEquals(targetEntries.length, 1);
      assertEquals(skipEntries[0].filePath, reviewedFilePath);
      assertEquals(targetEntries[0].filePath, '/path/to/incomplete.md');
    });
  });
});
