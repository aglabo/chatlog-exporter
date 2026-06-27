// src: skills/_scripts/libs/cache/__tests__/unit/cache-utils.unit.spec.ts
// @(#): cache-utils ユニットテスト
//       対象: getCacheSlug / readCache / writeCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { assertSpyCalls, stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { getCacheSlug, readCache, writeCache } from '../../cache-utils.ts';
// types
import type { CacheWriteProviders } from '../../cache-utils.ts';

// ─── Internal Helpers

// constants
const _CACHE_DIR_PREFIX = 'cache-utils-test';

// ─── Tests

/**
 * `getCacheSlug` / `readCache` / `writeCache` のユニットテストスイート。
 *
 * キャッシュファイルの slug 算出・読み書きを検証する。
 *
 * テスト ID 範囲: T-LIB-CA-01 〜 T-LIB-CA-10
 *
 * @see getCacheSlug
 * @see readCache
 * @see writeCache
 */
describe('cache-utils', () => {
  /**
   * `getCacheSlug` のテスト。
   *
   * パス区切り文字を `_` に正規化した slug を返すことを検証する。
   */
  describe('getCacheSlug', () => {
    /** 正常系: ファイル名のみの slug を返すケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-CA-01: Unix パスからファイル名のみを返す', () => {
        const _slug = getCacheSlug('/c/Users/user/chatlogs/subdir/file.md');
        assertEquals(_slug, 'file.md');
      });

      it('[Normal] T-LIB-CA-02: ファイル名のみのパスもそのまま返す', () => {
        const _slug = getCacheSlug('file.md');
        assertEquals(_slug, 'file.md');
      });
    });

    /** エッジケース: Windows スタイルのバックスラッシュ。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-CA-03: Windows バックスラッシュパスからもファイル名のみを返す', () => {
        const _slug = getCacheSlug('W:\\chatlogs\\subdir\\file.md');
        assertEquals(_slug, 'file.md');
      });
    });
  });

  /**
   * `readCache` のテスト。
   *
   * ファイル不在時は `{}` を返し、ファイルがある場合はパース済みオブジェクトを返すことを検証する。
   * DI: カスタム readProvider を差し込んで呼び出しを検証する。
   */
  describe('readCache', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: _CACHE_DIR_PREFIX });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 正常系: ファイル不在時・ファイルあり時・DI カスタムプロバイダーのキャッシュ読み込み。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-CA-04: ファイルが存在しない → {} を返す', async () => {
        const _result = await readCache(tempDir, 'nonexistent');
        assertEquals(_result, {});
      });

      it('[Normal] T-LIB-CA-05: ファイルが存在する → パース済みオブジェクトを返す', async () => {
        const _slug = 'test-entry';
        const _data = { type: 'tutorial', category: 'programming' };
        await Deno.writeTextFile(`${tempDir}/${_slug}.cache.json`, JSON.stringify(_data));

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, _data);
      });

      it('[Normal] T-LIB-CA-06: カスタム readProvider スタブを渡すと、Deno.readTextFile の代わりに呼ばれる', async () => {
        const _slug = 'di-test';
        const _data = { type: 'stub-result' };
        // stub object to track calls
        const _providerObj = {
          read: (_path: string): Promise<string> => Promise.resolve(JSON.stringify(_data)),
        };
        const _readStub: Stub = stub(_providerObj, 'read', (_path: string) => Promise.resolve(JSON.stringify(_data)));

        try {
          const _result = await readCache(tempDir, _slug, (p) => _providerObj.read(p));
          assertSpyCalls(_readStub, 1);
          assertEquals(_result, _data);
        } finally {
          _readStub.restore();
        }
      });
    });
  });

  /**
   * `writeCache` のテスト。
   *
   * 新規作成・既存キャッシュへのマージ・DI providers 全差し替えを検証する。
   */
  describe('writeCache', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: _CACHE_DIR_PREFIX });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 正常系: 新規作成・マージ書き込み・DI providers 全差し替え。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-CA-07: 新規キャッシュファイルを作成する', async () => {
        const _slug = 'new-entry';
        await writeCache(tempDir, _slug, { type: 'tutorial' });

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, { type: 'tutorial' });
      });

      it('[Normal] T-LIB-CA-08: 既存キャッシュに patch をマージし、既存フィールドを保持する', async () => {
        const _slug = 'merge-entry';
        await writeCache(tempDir, _slug, { type: 'tutorial' });
        await writeCache(tempDir, _slug, { category: 'programming' });

        const _result = await readCache(tempDir, _slug);

        assertEquals(_result, { type: 'tutorial', category: 'programming' });
      });

      it('[Normal] T-LIB-CA-10: providers 全差し替えで Deno API が一切呼ばれない', async () => {
        const _slug = 'di-all-test';
        const _cache: Record<string, string> = {};

        // Deno global stubs — must not be called
        const _denoReadStub: Stub = stub(Deno, 'readTextFile', () => {
          throw new Error('Deno.readTextFile should not be called');
        });
        const _denoWriteStub: Stub = stub(Deno, 'writeTextFile', () => {
          throw new Error('Deno.writeTextFile should not be called');
        });
        const _denoMkdirStub: Stub = stub(Deno, 'mkdir', () => {
          throw new Error('Deno.mkdir should not be called');
        });
        const _denoRenameStub: Stub = stub(Deno, 'rename', () => {
          throw new Error('Deno.rename should not be called');
        });

        try {
          const _providers: CacheWriteProviders = {
            readTextFile: (_p: string) => Promise.resolve(_cache[_p] ?? 'null'),
            writeTextFile: (p: string, data: string) => {
              _cache[p] = data;
              return Promise.resolve();
            },
            mkdir: (_p: string, _opts?: { recursive?: boolean }) => Promise.resolve(),
            rename: (o: string, n: string) => {
              _cache[n] = _cache[o] ?? '';
              delete _cache[o];
              return Promise.resolve();
            },
          };

          await writeCache(tempDir, _slug, { type: 'injected' }, _providers);

          assertSpyCalls(_denoReadStub, 0);
          assertSpyCalls(_denoWriteStub, 0);
          assertSpyCalls(_denoMkdirStub, 0);
          assertSpyCalls(_denoRenameStub, 0);
        } finally {
          _denoReadStub.restore();
          _denoWriteStub.restore();
          _denoMkdirStub.restore();
          _denoRenameStub.restore();
        }
      });
    });

    /** エッジケース: キャッシュディレクトリが存在しない場合の自動作成。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-CA-09: cacheDir が存在しなくても自動作成して書き込む', async () => {
        const _nonExistentDir = `${tempDir}/nested/cache`;
        const _slug = 'auto-dir-entry';
        await writeCache(_nonExistentDir, _slug, { type: 'tutorial' });

        const _result = await readCache(_nonExistentDir, _slug);

        assertEquals(_result, { type: 'tutorial' });
      });
    });
  });
});
