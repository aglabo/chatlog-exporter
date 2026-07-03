// src: scripts/modules/__tests__/unit/setfm-cache.unit.spec.ts
// @(#): ChatlogWorks<SetfmCache> を使ったキャッシュ操作パターンのユニットテスト
//       対象: ChatlogWorks (set-frontmatter 固有のキャッシュパターン)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogWorks } from '../../../../../_scripts/classes/ChatlogWorks.class.ts';
// types
import { CACHE_STATUSES } from '../../../../../_scripts/types/cache-status.const.types.ts';
import type { SetfmCache } from '../../../types/cache.types.ts';

// ─── Internal Helpers

// constants
/** テスト用エントリファイルパス。ChatlogWorks がベース名をキーとして使う動作を確認する。 */
const _ENTRY_PATH = '/some/dir/test-entry.md';

// functions
/**
 * バッファプロバイダーを使った `ChatlogWorks<SetfmCache>` インスタンスを生成する。
 *
 * ファイルシステムに依存しないテストのため、`Map<string, string>` をバッファとして使用する。
 *
 * @param buf - 読み書きを受け持つバッファ
 * @param cacheRoot - テスト用キャッシュルートパス
 * @returns 初期化済みの `ChatlogWorks<SetfmCache>` インスタンス
 */
const _makeCache = async (buf: Map<string, string>, cacheRoot: string): Promise<ChatlogWorks<SetfmCache>> => {
  const cache = new ChatlogWorks<SetfmCache>('fm-cache', cacheRoot, undefined, {
    cache: {
      readTextFile: (path) => {
        const data = buf.get(path);
        if (data === undefined) { return Promise.reject(new Error('not found')); }
        return Promise.resolve(data);
      },
      writeTextFile: (path, data) => {
        buf.set(path, data);
        return Promise.resolve();
      },
      mkdir: () => Promise.resolve(),
    },
  });
  await cache.ready;
  return cache;
};

// ─── Tests

/**
 * `ChatlogWorks<SetfmCache>` を使った set-frontmatter 固有キャッシュパターンのテストスイート。
 *
 * Phase 2+3a（type/category の書き込み）と Phase 3b（frontmatter のマージ書き込み）の
 * 動作を検証する。ChatlogWorks 自体のユニットテストは別ファイルで実施済みのため、
 * ここでは set-frontmatter 固有の使用パターンに集中する。
 *
 * テスト ID 範囲: T-SF-CA-01 〜 T-SF-CA-03
 *
 * @see ChatlogWorks
 * @see SetfmCache
 */
describe('setfm-cache', () => {
  let buf: Map<string, string>;
  let cacheRoot: string;

  beforeEach(async () => {
    buf = new Map<string, string>();
    cacheRoot = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(cacheRoot, { recursive: true });
  });

  /**
   * Phase 3b パターン: 既存の `{ type, category }` に `frontmatter` をマージして write するケース。
   *
   * `ChatlogWorks.write` は上書きのため、Phase 3b では read → spread merge → write の手順が必要。
   */
  describe('When: Phase 3b - frontmatter のマージ書き込み', () => {
    /** Phase 2+3a 後に Phase 3b でマージして write するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-CA-02-01: Phase 3b マージパターン → {type, category, frontmatter} が全て返る', async () => {
        const cache = await _makeCache(buf, cacheRoot);
        const _fmSnapshot = { title: 'テスト', summary: '概要', topics: ['tech'], tags: ['lang:typescript'] };

        // Phase 2+3a: type, category を書き込む
        await cache.write(_ENTRY_PATH, { type: 'tech', category: 'development' });

        // Phase 3b: 既存値を read してマージ後に write する
        const _existing = await cache.read(_ENTRY_PATH);
        await cache.write(_ENTRY_PATH, { ..._existing, frontmatter: _fmSnapshot });

        const result = await cache.read(_ENTRY_PATH);
        assertEquals(result, {
          type: 'tech',
          category: 'development',
          frontmatter: { title: 'テスト', summary: '概要', topics: ['tech'], tags: ['lang:typescript'] },
        });
      });
    });
  });

  /**
   * キャッシュミスのエッジケース。
   *
   * Phase 2+3a でキャッシュヒットしない場合、read は `{}` を返す。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-SF-CA-03-01: 存在しないエントリの read → {} が返る', async () => {
      const cache = await _makeCache(buf, cacheRoot);

      const result = await cache.read('/nonexistent/path.md');

      assertEquals(result, {});
    });
  });

  /**
   * status フィールドの書き込み・読み取りパターン。
   *
   * Phase 4 (applyActions) で記録するステータス値の保存と後方互換性を検証する。
   */
  describe('When: status フィールド', () => {
    /** status:'written' を含むオブジェクトを write して read で返るケース。 */
    describe('When: 正常系', () => {
      it("[Normal] T-SF-CA-04-01: status:'written' を write → read で status フィールドが返る", async () => {
        const cache = await _makeCache(buf, cacheRoot);

        await cache.write(_ENTRY_PATH, { type: 'tech', status: CACHE_STATUSES.WRITTEN });
        const result = await cache.read(_ENTRY_PATH);

        assertEquals(result, { type: 'tech', status: 'written' });
      });
    });

    /** status フィールドなしで write しても他フィールドが正常に返るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-CA-05-01: status フィールドなしで write → read でも他フィールドは正常', async () => {
        const cache = await _makeCache(buf, cacheRoot);

        await cache.write(_ENTRY_PATH, { type: 'tech', category: 'development' });
        const result = await cache.read(_ENTRY_PATH);

        assertEquals(result, { type: 'tech', category: 'development' });
      });

      it('[Edge] T-SF-CA-06-01: 既存キャッシュ（type あり）に status がない場合は undefined', async () => {
        const cache = await _makeCache(buf, cacheRoot);

        await cache.write(_ENTRY_PATH, { type: 'tech' });
        const result = await cache.read(_ENTRY_PATH);

        assertEquals(result.status, undefined);
      });
    });
  });
});
