// src: scripts/__tests__/unit/setfm-count-by-status.unit.spec.ts
// @(#): _countByStatus ステータス別集計ロジックのユニットテスト
//       対象: _countByStatusForTest
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
import { _countByStatusForTest as countByStatus } from '../../set-frontmatter.ts';

// ─── Helpers
import { ChatlogCache } from '../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../types/cache.const.type.ts';
// types
import type { SetfmCache } from '../../types/cache.types.ts';

// ─── Internal Helpers

// constants

/** テスト用キャッシュディレクトリの絶対パス。`ChatlogCache` の `subDir` に渡す。 */
const _UNIT_TEST_CACHE_DIR = normalizePath(
  new URL('./fixtures-data/fm-cache-cbs-unit', import.meta.url).pathname,
);

// functions

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

/**
 * パスごとに指定 status を返すインメモリキャッシュを生成する。
 *
 * `readTextFile` はパスにマッチする status を JSON で返し、マッチしないパスは reject（キャッシュミス）する。
 *
 * @param statusByPath - ファイルパスと注入する `status` の対応表（`status === null` はキャッシュミス）
 * @returns 指定されたパスごとに status を返す `ChatlogCache<SetfmCache>` インスタンス
 */
const _makeCache = async (
  statusByPath: readonly (readonly [string, SetfmCache['status'] | null])[],
): Promise<ChatlogCache<SetfmCache>> => {
  const cache = new ChatlogCache<SetfmCache>(_UNIT_TEST_CACHE_DIR, '', undefined, {
    cache: {
      writeTextFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readTextFile: (path: string) => {
        const found = statusByPath.find(([p]) => path.includes(p.slice(1)));
        if (found && found[1] !== null) {
          return Promise.resolve(JSON.stringify({ status: found[1] }));
        }
        return Promise.reject(new Error('not found'));
      },
      glob: (_pattern: string) => Promise.resolve(statusByPath.filter(([, s]) => s !== null).map(([p]) => p)),
    },
  });
  await cache.ready;
  return cache;
};

// ─── Tests

/**
 * `_countByStatus` のステータス別集計ロジックのユニットテストスイート。
 *
 * 全エントリを `cache.read().status` でバケット分類し、全 status バケットを 0 初期化してから加算する。
 * キャッシュミス（status undefined）は EMPTY ('') バケットに集計する。
 *
 * テスト ID 範囲: T-SF-CBS-01 〜 T-SF-CBS-04
 *
 * @see _countByStatusForTest
 */
describe('_countByStatus', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-SF-CBS-01: 各 status を持つエントリが対応バケットに集計される（全 status 網羅）', async () => {
      const _cases = [
        ['/type-category.md', SETFM_CACHE_STATUSES.TYPE_CATEGORY],
        ['/frontmatter.md', SETFM_CACHE_STATUSES.FRONTMATTER],
        ['/reviewed.md', SETFM_CACHE_STATUSES.REVIEWED],
        ['/written.md', SETFM_CACHE_STATUSES.WRITTEN],
        ['/review-failed.md', SETFM_CACHE_STATUSES.REVIEW_FAILED],
        ['/empty.md', SETFM_CACHE_STATUSES.EMPTY],
      ] as const;
      const entries = _cases.map(([p]) => _makeEntry(p));
      const cache = await _makeCache(_cases);

      const result = countByStatus(entries, cache);

      assertEquals(result[SETFM_CACHE_STATUSES.TYPE_CATEGORY], 1);
      assertEquals(result[SETFM_CACHE_STATUSES.FRONTMATTER], 1);
      assertEquals(result[SETFM_CACHE_STATUSES.REVIEWED], 1);
      assertEquals(result[SETFM_CACHE_STATUSES.WRITTEN], 1);
      assertEquals(result[SETFM_CACHE_STATUSES.REVIEW_FAILED], 1);
      assertEquals(result[SETFM_CACHE_STATUSES.EMPTY], 1);
    });

    it('[Normal] T-SF-CBS-04: 複数エントリが同一 status → 加算される', async () => {
      const _cases = [
        ['/w1.md', SETFM_CACHE_STATUSES.WRITTEN],
        ['/w2.md', SETFM_CACHE_STATUSES.WRITTEN],
        ['/w3.md', SETFM_CACHE_STATUSES.WRITTEN],
      ] as const;
      const entries = _cases.map(([p]) => _makeEntry(p));
      const cache = await _makeCache(_cases);

      const result = countByStatus(entries, cache);

      assertEquals(result[SETFM_CACHE_STATUSES.WRITTEN], 3);
    });
  });

  describe('When: エッジケース', () => {
    it('[Edge] T-SF-CBS-02: キャッシュミス（status undefined）は EMPTY バケットに集計される', async () => {
      const _cases = [
        ['/miss1.md', null],
        ['/real-empty.md', SETFM_CACHE_STATUSES.EMPTY],
      ] as const;
      const entries = _cases.map(([p]) => _makeEntry(p));
      const cache = await _makeCache(_cases);

      const result = countByStatus(entries, cache);

      // キャッシュミスと実 '' status がともに EMPTY バケットへ
      assertEquals(result[SETFM_CACHE_STATUSES.EMPTY], 2);
    });

    it('[Edge] T-SF-CBS-03: 空配列 → 全 status バケットが 0', async () => {
      const cache = await _makeCache([]);

      const result = countByStatus([], cache);

      Object.values(SETFM_CACHE_STATUSES).forEach((status) => {
        assertEquals(result[status], 0);
      });
    });
  });
});
