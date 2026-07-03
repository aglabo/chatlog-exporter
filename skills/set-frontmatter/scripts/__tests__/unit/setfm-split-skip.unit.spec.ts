// src: scripts/__tests__/unit/setfm-split-skip.unit.spec.ts
// @(#): _splitSkip エントリ分割のユニットテスト
//       対象: _splitSkipForTest
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
import { _splitSkipForTest as splitSkip } from '../../set-frontmatter.ts';

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
  new URL('./fixtures-data/fm-cache-ss-unit', import.meta.url).pathname,
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

// ─── Tests

/**
 * `_splitSkip` の skip/target 分割ロジックを検証する。
 *
 * テスト ID 範囲: T-SF-SS-01 〜 T-SF-SS-05
 *
 * @see _splitSkipForTest
 */
describe('_splitSkip', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-SF-SS-01: status=reviewed（全フィールド充足）→ skipEntries に入る（targetEntries は空）', async () => {
      const filePath = '/path/to/reviewed-full.md';
      const entry = _makeEntry(filePath, [
        'type: research',
        'category: development',
        'title: Test Title',
        'summary: Test summary text',
        'topics:',
        '  - typescript',
        'tags:',
        '  - lang:typescript',
      ], '# Full entry body');

      const cache = await _makeCacheWithHit(filePath, { status: 'reviewed' });

      const { skipEntries, targetEntries } = splitSkip([entry], cache);

      assertEquals(skipEntries.length, 1);
      assertEquals(targetEntries.length, 0);
    });

    it('[Normal] T-SF-SS-03: cache miss（フィールド不足）→ targetEntries に入る', async () => {
      const entry = _makeEntry('/path/to/incomplete.md', [
        'type: research',
        'category: development',
        'title: Test Title',
        'summary: Test summary text',
        'tags:',
        '  - lang:typescript',
      ], '# Missing topics body');
      const cache = await _makeEmptyCache();

      const { skipEntries, targetEntries } = splitSkip([entry], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SF-SS-06: status=review-failed → targetEntries に入る（skipEntries は空）', async () => {
      const filePath = '/path/to/review-failed.md';
      const entry = _makeEntry(filePath, ['title: Review Failed'], '# body');
      const cache = await _makeCacheWithHit(filePath, { status: 'review-failed' });

      const { skipEntries, targetEntries } = splitSkip([entry], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });

    it('[Edge] T-SF-SS-04: 空配列 entries → skipEntries も targetEntries も空', async () => {
      const cache = await _makeEmptyCache();

      const { skipEntries, targetEntries } = splitSkip([], cache);

      assertEquals(skipEntries.length, 0);
      assertEquals(targetEntries.length, 0);
    });

    it('[Edge] T-SF-SS-05: skip（status=reviewed）と target（cache miss）の混在 → 正しく分割', async () => {
      const reviewedPath = '/path/to/reviewed.md';
      const missPath = '/path/to/incomplete.md';
      const reviewedEntry = _makeEntry(reviewedPath, ['title: Reviewed'], '# Reviewed body');
      const missEntry = _makeEntry(missPath, ['title: Incomplete'], '# Incomplete body');

      const cache = new ChatlogWorks<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
        cache: {
          writeTextFile: () => Promise.resolve(),
          mkdir: () => Promise.resolve(),
          readTextFile: (path: string) => {
            if (path.includes('reviewed')) { return Promise.resolve(JSON.stringify({ status: 'reviewed' })); }
            return Promise.reject(new Error('not found'));
          },
          glob: (_pattern: string) => Promise.resolve([reviewedPath]),
        },
      });
      await cache.ready;

      const { skipEntries, targetEntries } = splitSkip([reviewedEntry, missEntry], cache);

      assertEquals(skipEntries.length, 1);
      assertEquals(targetEntries.length, 1);
      assertEquals(skipEntries[0].filePath, reviewedPath);
      assertEquals(targetEntries[0].filePath, missPath);
    });
  });
});
