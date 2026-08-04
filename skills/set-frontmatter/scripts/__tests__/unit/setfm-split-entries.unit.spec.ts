// src: scripts/__tests__/unit/setfm-split-entries.unit.spec.ts
// @(#): _splitEntries 3分割ロジックのユニットテスト
//       対象: _splitEntriesForTest
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
import { _splitEntriesForTest as splitEntries } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-cache-se-unit', import.meta.url).pathname,
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

/**
 * `cache.read(filePath)` が指定の `data` を返すキャッシュを返す。
 *
 * @param filePath - キャッシュキーとなるファイルパス
 * @param data - `cache.read(filePath)` に返させる `SetfmCache` データ
 * @returns 指定ファイルにキャッシュヒットする `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCacheWithHit = async (
  filePath: string,
  data: Partial<SetfmCache>,
): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
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
 * `_splitEntries` の3分割ロジックのユニットテストスイート。
 *
 * entries を written / reviewed / generate の3グループに重複なし・漏れなしで分割することを検証する。
 *
 * テスト ID 範囲: T-SF-SE-01 〜 T-SF-SE-11
 *
 * @see _splitEntriesForTest
 */
describe('_splitEntries', () => {
  describe('When: writtenEntries 判定', () => {
    it('[Normal] T-SF-SE-01: status=written → writtenEntries に入る（他は空）', async () => {
      const filePath = '/path/to/written.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: SETFM_CACHE_STATUSES.WRITTEN });

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 1);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 0);
      assertEquals(writtenEntries[0].filePath, filePath);
    });
  });

  describe('When: reviewedEntries 判定', () => {
    it('[Normal] T-SF-SE-02: status=reviewed → reviewedEntries に入る（他は空）', async () => {
      const filePath = '/path/to/reviewed.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: SETFM_CACHE_STATUSES.REVIEWED });

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 1);
      assertEquals(generateEntries.length, 0);
      assertEquals(reviewedEntries[0].filePath, filePath);
    });
  });

  describe('When: generateEntries 判定', () => {
    it('[Normal] T-SF-SE-03: status=frontmatter → generateEntries に入る（他は空）', async () => {
      const filePath = '/path/to/frontmatter.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: SETFM_CACHE_STATUSES.FRONTMATTER });

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 1);
      assertEquals(generateEntries[0].filePath, filePath);
    });

    it('[Normal] T-SF-SE-04: status=empty（キャッシュミス）→ generateEntries に入る（他は空）', async () => {
      const entry = _makeEntry('/path/to/new.md');
      const cache = await _makeEmptyCache();

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 1);
    });

    it('[Normal] T-SF-SE-05: status=review-failed → generateEntries に入る（他は空）', async () => {
      const filePath = '/path/to/review-failed.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: SETFM_CACHE_STATUSES.REVIEW_FAILED });

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 1);
      assertEquals(generateEntries[0].filePath, filePath);
    });

    it('[Normal] T-SF-SE-06: status=type-category → generateEntries に入る（他は空）', async () => {
      const filePath = '/path/to/type-category.md';
      const entry = _makeEntry(filePath);
      const cache = await _makeCacheWithHit(filePath, { status: SETFM_CACHE_STATUSES.TYPE_CATEGORY });

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 1);
      assertEquals(generateEntries[0].filePath, filePath);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SF-SE-07: 空配列 entries → 3グループすべて空', async () => {
      const cache = await _makeEmptyCache();

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 0);
    });

    it('[Edge] T-SF-SE-08: 3グループ混在 → 重複なし・漏れなしで分割される', async () => {
      const writtenPath = '/path/to/written.md';
      const reviewedPath = '/path/to/reviewed.md';
      const newPath = '/path/to/new.md';
      const writtenEntry = _makeEntry(writtenPath);
      const reviewedEntry = _makeEntry(reviewedPath);
      const newEntry = _makeEntry(newPath);

      const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
        cache: {
          writeTextFile: () => Promise.resolve(),
          mkdir: () => Promise.resolve(),
          readTextFile: (path: string) => {
            if (path.includes('written')) {
              return Promise.resolve(JSON.stringify({ status: SETFM_CACHE_STATUSES.WRITTEN }));
            }
            if (path.includes('reviewed')) {
              return Promise.resolve(JSON.stringify({ status: SETFM_CACHE_STATUSES.REVIEWED }));
            }
            return Promise.reject(new Error('not found'));
          },
          glob: (_pattern: string) => Promise.resolve([writtenPath, reviewedPath]),
        },
      });
      await cache.ready;

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries(
        [writtenEntry, reviewedEntry, newEntry],
        cache,
      );

      assertEquals(writtenEntries.length, 1);
      assertEquals(reviewedEntries.length, 1);
      assertEquals(generateEntries.length, 1);
      assertEquals(writtenEntries[0].filePath, writtenPath);
      assertEquals(reviewedEntries[0].filePath, reviewedPath);
      assertEquals(generateEntries[0].filePath, newPath);
      // 漏れなし確認: 合計が元の entries.length と一致
      assertEquals(writtenEntries.length + reviewedEntries.length + generateEntries.length, 3);
    });

    it('[Edge] T-SF-SE-09: reviewed と frontmatter の混在 → reviewedEntries / generateEntries に正しく分割', async () => {
      const reviewedPath = '/path/to/reviewed.md';
      const frontmatterPath = '/path/to/frontmatter.md';
      const reviewedEntry = _makeEntry(reviewedPath);
      const frontmatterEntry = _makeEntry(frontmatterPath);

      const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
        cache: {
          writeTextFile: () => Promise.resolve(),
          mkdir: () => Promise.resolve(),
          readTextFile: (path: string) => {
            if (path.includes('reviewed')) {
              return Promise.resolve(JSON.stringify({ status: SETFM_CACHE_STATUSES.REVIEWED }));
            }
            return Promise.resolve(JSON.stringify({ status: SETFM_CACHE_STATUSES.FRONTMATTER }));
          },
          glob: (_pattern: string) => Promise.resolve([reviewedPath, frontmatterPath]),
        },
      });
      await cache.ready;

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries(
        [reviewedEntry, frontmatterEntry],
        cache,
      );

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 1);
      assertEquals(generateEntries.length, 1);
      assertEquals(reviewedEntries[0].filePath, reviewedPath);
      assertEquals(generateEntries[0].filePath, frontmatterPath);
    });

    it('[Edge] T-SF-SE-11: status=undefined（キャッシュミス）→ generateEntries に入る（明示的 OR 条件確認）', async () => {
      const filePath = '/path/to/undefined-status.md';
      const entry = _makeEntry(filePath);
      // キャッシュに status フィールドを持たないエントリを書き込む（status=undefined）
      const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
        cache: {
          writeTextFile: () => Promise.resolve(),
          mkdir: () => Promise.resolve(),
          readTextFile: (_path: string) => Promise.resolve(JSON.stringify({ type: 'some-type', category: 'some-cat' })),
          glob: (_pattern: string) => Promise.resolve([filePath]),
        },
      });
      await cache.ready;

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries([entry], cache);

      assertEquals(writtenEntries.length, 0);
      assertEquals(reviewedEntries.length, 0);
      assertEquals(generateEntries.length, 1);
      assertEquals(generateEntries[0].filePath, filePath);
    });

    it('[Edge] T-SF-SE-10: 合計エントリ数が入力と一致する（漏れなし・重複なし）', async () => {
      const paths = [
        ['/written.md', SETFM_CACHE_STATUSES.WRITTEN],
        ['/reviewed.md', SETFM_CACHE_STATUSES.REVIEWED],
        ['/frontmatter.md', SETFM_CACHE_STATUSES.FRONTMATTER],
        ['/type-category.md', SETFM_CACHE_STATUSES.TYPE_CATEGORY],
        ['/review-failed.md', SETFM_CACHE_STATUSES.REVIEW_FAILED],
        ['/new.md', null], // cache miss
      ] as const;
      const entries = paths.map(([p]) => _makeEntry(p));

      const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
        cache: {
          writeTextFile: () => Promise.resolve(),
          mkdir: () => Promise.resolve(),
          readTextFile: (path: string) => {
            const found = paths.find(([p]) => path.includes(p.slice(1)));
            if (found && found[1]) {
              return Promise.resolve(JSON.stringify({ status: found[1] }));
            }
            return Promise.reject(new Error('not found'));
          },
          glob: (_pattern: string) => Promise.resolve(paths.filter(([, s]) => s !== null).map(([p]) => p)),
        },
      });
      await cache.ready;

      const { writtenEntries, reviewedEntries, generateEntries } = splitEntries(entries, cache);

      assertEquals(
        writtenEntries.length + reviewedEntries.length + generateEntries.length,
        entries.length,
      );
    });
  });
});
