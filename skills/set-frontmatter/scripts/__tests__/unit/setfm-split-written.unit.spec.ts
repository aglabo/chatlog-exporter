// src: scripts/__tests__/unit/setfm-split-written.unit.spec.ts
// @(#): _splitWritten written フィルタのユニットテスト
//       対象: _splitWrittenForTest
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
import { _splitWrittenForTest as splitWritten } from '../../set-frontmatter.ts';

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
  new URL('./fixtures-data/fm-cache-sw-unit', import.meta.url).pathname,
);

// functions

/**
 * 書き込みをすべて noop にしたインメモリキャッシュを返す。
 * `glob` が空リストを返すことで全パスがキャッシュミス（`cache.read()` → `{}`）になる。
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
 * @returns 指定されたパスを持つ最小構成の `ChatlogEntry`
 */
const _makeEntry = (filePath: string): ChatlogEntry => {
  const text = ['---', 'session_id: sess-001', '---', '', '# body'].join('\n');
  return new ChatlogEntry(text, { filePath });
};

// ─── Tests

/**
 * `_splitWritten` の written フィルタ分割ロジックのユニットテストスイート。
 *
 * `status === 'written'` のエントリが writtenEntries に分離され、
 * それ以外が targetEntries に残ることを検証する。
 *
 * テスト ID 範囲: T-SF-SW-01 〜 T-SF-SW-05
 *
 * @see _splitWrittenForTest
 */
describe('_splitWritten', () => {
  describe('When: status=written キャッシュあり', () => {
    it('[Normal] T-SF-SW-01: status=written のエントリ → writtenEntries に入る（targetEntries は空）', async () => {
      const filePath = '/path/to/written.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: 'written' });

      const { writtenEntries, targetEntries } = splitWritten([entry], cache);

      assertEquals(writtenEntries.length, 1);
      assertEquals(targetEntries.length, 0);
      assertEquals(writtenEntries[0].filePath, filePath);
    });
  });

  describe('When: status=written でない（cache ミス）', () => {
    it('[Normal] T-SF-SW-02: status なし（cache miss）のエントリ → targetEntries に入る（writtenEntries は空）', async () => {
      const entry = _makeEntry('/path/to/target.md');
      const cache = await _makeEmptyCache();

      const { writtenEntries, targetEntries } = splitWritten([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });
  });

  describe('When: status=reviewed など written 以外のステータス', () => {
    it('[Normal] T-SF-SW-03: status=reviewed のエントリ → targetEntries に入る', async () => {
      const filePath = '/path/to/reviewed.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: 'reviewed' });

      const { writtenEntries, targetEntries } = splitWritten([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(targetEntries.length, 1);
    });
  });

  describe('When: 空配列入力（境界値）', () => {
    it('[Edge] T-SF-SW-04: 空配列 entries → writtenEntries も targetEntries も空', async () => {
      const cache = await _makeEmptyCache();

      const { writtenEntries, targetEntries } = splitWritten([], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(targetEntries.length, 0);
    });
  });

  describe('When: written と target の混在', () => {
    it('[Edge] T-SF-SW-05: written 1件 + target 1件の混在 → 正しく分割される', async () => {
      const writtenPath = '/path/to/written.md';
      const targetPath = '/path/to/target.md';
      const writtenEntry = _makeEntry(writtenPath);
      const targetEntry = _makeEntry(targetPath);
      const cache = await _makeCacheWithHit(writtenPath, { status: 'written' });

      const { writtenEntries, targetEntries } = splitWritten([writtenEntry, targetEntry], cache);

      assertEquals(writtenEntries.length, 1);
      assertEquals(targetEntries.length, 1);
      assertEquals(writtenEntries[0].filePath, writtenPath);
      assertEquals(targetEntries[0].filePath, targetPath);
    });
  });
});
