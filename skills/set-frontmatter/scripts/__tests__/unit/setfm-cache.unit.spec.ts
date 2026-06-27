// src: scripts/__tests__/unit/setfm-cache.unit.spec.ts
// @(#): setfm-cache ユニットテスト
//       対象: getCacheSlug / readCache / writeCache
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
import { getCacheSlug, readCache, writeCache } from '../../modules/setfm-cache.ts';

// ─── Internal Helpers

// constants
const _INPUT_DIR = '/c/Users/user/chatlogs/normalizelogs';
const _CACHE_DIR_PREFIX = 'setfm-cache-test';

// ─── Tests

/**
 * `getCacheSlug` / `readCache` / `writeCache` のユニットテストスイート。
 *
 * キャッシュファイルの slug 算出・読み書きを検証する。
 *
 * テスト ID 範囲: T-SF-CA-01 〜 T-SF-CA-10
 *
 * @see getCacheSlug
 * @see readCache
 * @see writeCache
 */
describe('setfm-cache', () => {
  /**
   * `getCacheSlug` のテスト。
   *
   * パス区切り文字を `_` に正規化した slug を返すことを検証する。
   */
  describe('getCacheSlug', () => {
    /** 正常系: Unix/Windows パスを正規化して slug を生成するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-CA-01: Unix パスの / を _ に置換する', () => {
        const _slug = getCacheSlug(_INPUT_DIR, `${_INPUT_DIR}/subdir/file.md`);
        assertEquals(_slug, 'subdir_file.md');
      });

      it('[Normal] T-SF-CA-02: 入力ディレクトリ直下のファイルは slug がファイル名のみ', () => {
        const _slug = getCacheSlug(_INPUT_DIR, `${_INPUT_DIR}/file.md`);
        assertEquals(_slug, 'file.md');
      });
    });

    /** エッジケース: Windows スタイルのバックスラッシュ。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-CA-03: Windows バックスラッシュも _ に置換する', () => {
        const _winInputDir = 'W:\\chatlogs\\normalizelogs';
        const _slug = getCacheSlug(_winInputDir, `${_winInputDir}\\subdir\\file.md`);
        assertEquals(_slug, 'subdir_file.md');
      });
    });
  });

  /**
   * `readCache` のテスト。
   *
   * ファイル不在時は `{}` を返し、ファイルがある場合はパース済みオブジェクトを返すことを検証する。
   */
  describe('readCache', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: _CACHE_DIR_PREFIX });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 正常系: ファイル不在時・ファイルあり時のキャッシュ読み込み。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-CA-04: ファイルが存在しない → {} を返す', async () => {
        const _result = await readCache(tempDir, 'nonexistent');
        assertEquals(_result, {});
      });

      it('[Normal] T-SF-CA-05: ファイルが存在する → パース済みオブジェクトを返す', async () => {
        const _slug = 'test-entry';
        const _data = { type: 'tutorial', category: 'programming' };
        await Deno.writeTextFile(`${tempDir}/${_slug}.cache.json`, JSON.stringify(_data));

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, _data);
      });
    });
  });

  /**
   * `writeCache` のテスト。
   *
   * 新規作成・既存キャッシュへのマージ（既存フィールドを保持）を検証する。
   */
  describe('writeCache', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: _CACHE_DIR_PREFIX });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 正常系: 新規作成とマージ書き込み。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SF-CA-06: 新規キャッシュファイルを作成する', async () => {
        const _slug = 'new-entry';
        await writeCache(tempDir, _slug, { type: 'tutorial' });

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, { type: 'tutorial' });
      });

      it('[Normal] T-SF-CA-07: 既存キャッシュに patch をマージし、既存フィールドを保持する', async () => {
        const _slug = 'merge-entry';
        await writeCache(tempDir, _slug, { type: 'tutorial' });
        await writeCache(tempDir, _slug, { category: 'programming' });

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, { type: 'tutorial', category: 'programming' });
      });
    });

    /** エッジケース: キャッシュディレクトリが存在しない場合の自動作成。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SF-CA-08: cacheDir が存在しなくても自動作成して書き込む', async () => {
        const _nonExistentDir = `${tempDir}/nested/cache`;
        const _slug = 'auto-dir-entry';
        await writeCache(_nonExistentDir, _slug, { type: 'tutorial' });

        const _result = await readCache(_nonExistentDir, _slug);

        assertEquals(_result, { type: 'tutorial' });
      });
    });
  });
});
