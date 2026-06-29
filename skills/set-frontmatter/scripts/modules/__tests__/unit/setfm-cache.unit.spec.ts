// src: scripts/modules/__tests__/unit/setfm-cache.unit.spec.ts
// @(#): readCache / writeCache / getCacheSlug のユニットテスト
//       対象: readCache, writeCache, getCacheSlug
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
import { getCacheSlug, readCache, writeCache } from '../../setfm-cache.ts';

// ─── Internal Helpers

// constants
/** テスト用キャッシュ識別子。`getCacheSlug` を使わず固定値でラウンドトリップを検証する。 */
const _SLUG = 'test-entry.md';

// ─── Tests

/**
 * `readCache` / `writeCache` / `getCacheSlug` のユニットテストスイート。
 *
 * 実ファイルシステムを使ったラウンドトリップと re-export の確認を行う。
 *
 * テスト ID 範囲: T-SF-CA-01-01 〜 T-SF-CA-03-01
 *
 * @see readCache
 * @see writeCache
 * @see getCacheSlug
 */
describe('setfm-cache', () => {
  /**
   * `readCache` / `writeCache` のラウンドトリップテスト。
   *
   * 実ディレクトリを使い書き込み・読み込み・マージ動作を検証する。
   */
  describe('readCache / writeCache', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir();
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 書き込んだ値がそのまま読み返せる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-CA-01-01: writeCache で { type: "tech" } を書き、readCache で同じ値が返る', async () => {
        await writeCache(tempDir, _SLUG, { type: 'tech' });
        const result = await readCache(tempDir, _SLUG);
        assertEquals(result, { type: 'tech' });
      });

      it('[Normal] T-SF-CA-01-02: writeCache を2回呼ぶと値がマージされる', async () => {
        await writeCache(tempDir, _SLUG, { type: 'tech' });
        await writeCache(tempDir, _SLUG, { category: 'life' });
        const result = await readCache(tempDir, _SLUG);
        assertEquals(result, { type: 'tech', category: 'life' });
      });
    });

    /** キャッシュファイルが存在しない境界値ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-CA-02-01: 存在しない slug を readCache すると {} が返る', async () => {
        const result = await readCache(tempDir, 'nonexistent.md');
        assertEquals(result, {});
      });
    });
  });

  /**
   * `getCacheSlug` の re-export 確認テスト。
   *
   * cache-utils から正しく re-export されていることを検証する。
   */
  describe('getCacheSlug', () => {
    it('[Normal] T-SF-CA-03-01: getCacheSlug がファイルパスから文字列を返す', () => {
      const result = getCacheSlug('/foo/bar.md');
      assertEquals(typeof result, 'string');
    });
  });
});
