// src: skills/_cle-libs/classes/__tests__/functional/ChatlogCache.functional.spec.ts
// @(#): ChatlogCache functional テスト - 実ファイルIOを使った検証
//       対象: ChatlogCache<T>
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogCache } from '../../ChatlogCache.class.ts';

// ─── Internal Helpers

// types
/** テスト用キャッシュデータ型（文字列値）。 */
interface _CacheData {
  value: string;
}

/** テスト用キャッシュデータ型（数値）。 */
interface _NumData {
  n: number;
}

// ─── Tests

/**
 * `ChatlogCache` クラスの functional テストスイート。
 *
 * 実ファイル IO を使って constructor・write・read・loadAll の動作を検証する。
 *
 * テスト ID 範囲: T-CLS-CC-37 〜 T-CLS-CC-41
 *
 * @see ChatlogCache
 */
describe('ChatlogCache', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /**
   * `constructor` のディレクトリ作成テスト。
   *
   * `await cache.ready` 後に実際のディレクトリが作成されることを検証する。
   */
  describe('constructor', () => {
    /** 有効な cacheRoot を渡してインスタンスを生成するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-37: cacheRoot=tempDir・subDir="clecache" → <tempDir>/clecache ディレクトリが作成される', async () => {
        const cache = new ChatlogCache<_CacheData>('clecache', tempDir);
        await cache.ready;

        const stat = await Deno.stat(`${tempDir}/clecache`);
        assertEquals(stat.isDirectory, true);
      });
    });
  });

  /**
   * `write` のファイル書き込みテスト。
   *
   * `write(key, data)` が `<cacheDir>/<key>.json` を実際に作成することを検証する。
   */
  describe('write', () => {
    /** 有効なキーとデータを渡してファイルを書き込むケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-38: write("foo", {value:"bar"}) → foo.json に {"value":"bar"} が書き込まれる', async () => {
        const cache = new ChatlogCache<_CacheData>('clecache', tempDir);
        await cache.ready;
        await cache.write('foo', { value: 'bar' });

        const content = await Deno.readTextFile(`${tempDir}/clecache/foo.json`);
        assertEquals(content, '{"value":"bar"}');
      });
    });
  });

  /**
   * `read` のファイル読み込みテスト。
   *
   * 正常系では新インスタンスでディスクから読み込めることを、エッジケースでは
   * 存在しないキーに対して `{}` が返ることを検証する。
   */
  describe('read', () => {
    /** 新インスタンスを生成してディスクから読み込むケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-39: write 後に新インスタンス生成・loadAll() 後に read → { value:"bar" } が返る', async () => {
        const cache1 = new ChatlogCache<_CacheData>('clecache', tempDir);
        await cache1.ready;
        await cache1.write('foo', { value: 'bar' });

        const cache2 = new ChatlogCache<_CacheData>('clecache', tempDir);
        await cache2.ready;
        await cache2.loadAll(2);
        const result = cache2.read('foo');

        assertEquals(result, { value: 'bar' });
      });
    });

    /** ファイルが存在しないキーで read を呼ぶケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CC-41: ファイル未作成のキー "nonexistent" を read → {} が返る', async () => {
        const cache = new ChatlogCache<_CacheData>('clecache', tempDir);
        await cache.ready;

        const result = await cache.read('nonexistent');
        assertEquals(result, {});
      });
    });
  });

  /**
   * `loadAll` の全ファイル読み込みテスト。
   *
   * `<cacheDir>/*.json` を全て読み込んで `_hash` に格納することを検証する。
   */
  describe('loadAll', () => {
    /** 複数ファイルを write 後に loadAll を呼ぶケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CC-40: 3ファイル write 後に loadAll → 各キーの read がすべてヒットする', async () => {
        const cache = new ChatlogCache<_NumData>('clecache', tempDir);
        await cache.ready;
        await cache.write('alpha', { n: 1 });
        await cache.write('beta', { n: 2 });
        await cache.write('gamma', { n: 3 });
        await cache.loadAll(2);

        assertEquals(await cache.read('alpha'), { n: 1 });
        assertEquals(await cache.read('beta'), { n: 2 });
        assertEquals(await cache.read('gamma'), { n: 3 });
      });
    });
  });
});
