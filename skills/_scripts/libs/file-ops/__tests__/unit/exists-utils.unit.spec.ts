// src: skills/_scripts/libs/file-ops/__tests__/unit/exists-utils.unit.spec.ts
// @(#): exists-utils ユニットテスト
//       対象: fileExists, fileOrDirExists, dirExists
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { dirExists, dirExistsSync, fileExists, fileOrDirExists } from '../../exists-utils.ts';

// ─── Helpers
// types
import type { StatProvider, StatSyncProvider } from '../../../../types/providers.types.ts';

// ─── Internal Helpers

/** ファイルとして存在することを示す `StatProvider` モック。`isFile: true, isDirectory: false` を返す。 */
const _existsFileStat: StatProvider = (_path: string) =>
  Promise.resolve({ isFile: true, isDirectory: false } as Deno.FileInfo);

/** ディレクトリとして存在することを示す `StatProvider` モック。`isFile: false, isDirectory: true` を返す。 */
const _existsDirStat: StatProvider = (_path: string) =>
  Promise.resolve({ isFile: false, isDirectory: true } as Deno.FileInfo);

/** 存在しないパスを示す `StatProvider` モック。`Deno.errors.NotFound` をスローする。 */
const _notFoundStat: StatProvider = (_path: string) => Promise.reject(new Deno.errors.NotFound('no such file'));

/** 権限不足を示す `StatProvider` モック。`Deno.errors.PermissionDenied` をスローする。 */
const _permissionDeniedStat: StatProvider = (_path: string) =>
  Promise.reject(new Deno.errors.PermissionDenied('permission denied'));

/** ディレクトリとして存在することを示す同期 `StatSyncProvider` モック。`isFile: false, isDirectory: true` を返す。 */
const _existsDirStatSync: StatSyncProvider = (_path: string) => ({ isFile: false, isDirectory: true } as Deno.FileInfo);

/** ファイルとして存在することを示す同期 `StatSyncProvider` モック。`isFile: true, isDirectory: false` を返す。 */
const _existsFileStatSync: StatSyncProvider = (
  _path: string,
) => ({ isFile: true, isDirectory: false } as Deno.FileInfo);

/** 存在しないパスを示す同期 `StatSyncProvider` モック。`Deno.errors.NotFound` をスローする。 */
const _notFoundStatSync: StatSyncProvider = (_path: string): Deno.FileInfo => {
  throw new Deno.errors.NotFound('no such file');
};

/** 権限不足を示す同期 `StatSyncProvider` モック。`Deno.errors.PermissionDenied` をスローする。 */
const _permissionDeniedStatSync: StatSyncProvider = (_path: string): Deno.FileInfo => {
  throw new Deno.errors.PermissionDenied('permission denied');
};

// ─── Tests

/**
 * `fileExists` 関数のユニットテストスイート。
 *
 * `fileExists(path, statProvider?)` は `statProvider` の `isFile` フラグでファイル存在を判定し、
 * 通常ファイルなら `true`、ディレクトリや不在なら `false` を返す。
 *
 * テスト ID 範囲: T-LIB-SU-01 〜 T-LIB-SU-04
 *
 * @see fileExists
 */
describe('fileExists', () => {
  /**
   * `statProvider` がファイル情報を返す前提条件グループ。
   *
   * ファイルとして存在するパスに対して `true` が返ることを検証する。
   */
  describe('Given: statProvider がファイル情報を返す', () => {
    /** `fileExists` を呼び出すとき。 */
    describe('When: fileExists を実行する', () => {
      /** `true` が返ることを検証する。 */
      describe('Then: T-LIB-SU-01 - true が返る', () => {
        it('T-LIB-SU-01-01: statProvider が成功を返す場合、true が返る', async () => {
          assertEquals(await fileExists('/some/file.md', _existsFileStat), true);
        });
      });
    });
  });

  /**
   * `statProvider` がディレクトリ情報を返す前提条件グループ。
   *
   * ディレクトリとして存在するパスは `isFile === false` のため `false` が返ることを検証する。
   */
  describe('Given: statProvider がディレクトリ情報を返す', () => {
    /** `fileExists` を呼び出すとき。 */
    describe('When: fileExists を実行する', () => {
      /** ディレクトリはファイルではないため `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-02 - false が返る', () => {
        it('T-LIB-SU-02-01: statProvider がディレクトリ情報を返す場合、false が返る', async () => {
          assertEquals(await fileExists('/some/dir', _existsDirStat), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 例外をスローする前提条件グループ。
   *
   * パスが存在しない場合に `false` が返ることを検証する。
   */
  describe('Given: statProvider が NotFound 例外をスローする', () => {
    /** `fileExists` を呼び出すとき。 */
    describe('When: fileExists を実行する', () => {
      /** `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-03 - false が返る', () => {
        it('T-LIB-SU-03-01: statProvider が NotFound をスローする場合、false が返る', async () => {
          assertEquals(await fileExists('/nonexistent/file.md', _notFoundStat), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 以外の例外をスローする前提条件グループ。
   *
   * パーミッションエラーなど回復不可能なエラーは握りつぶさず再スローすることを検証する。
   */
  describe('Given: statProvider が PermissionDenied 例外をスローする', () => {
    /** `fileExists` を呼び出すとき。 */
    describe('When: fileExists を実行する', () => {
      /** `PermissionDenied` が再スローされることを検証する。 */
      describe('Then: T-LIB-SU-04 - PermissionDenied が再スローされる', () => {
        it('T-LIB-SU-04-01: statProvider が PermissionDenied をスローする場合、そのまま再スローされる', async () => {
          await assertRejects(
            () => fileExists('/restricted/file.md', _permissionDeniedStat),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });
});

/**
 * `fileOrDirExists` 関数のユニットテストスイート。
 *
 * `fileOrDirExists(path, statProvider?)` は `statProvider` の成否でパス存在を判定し、
 * ファイル・ディレクトリ問わず存在すれば `true`、存在しなければ `false` を返す。
 *
 * テスト ID 範囲: T-LIB-SU-05 〜 T-LIB-SU-08
 *
 * @see fileOrDirExists
 */
describe('fileOrDirExists', () => {
  /**
   * `statProvider` がファイル情報を返す前提条件グループ。
   *
   * ファイルとして存在するパスに対して `true` が返ることを検証する。
   */
  describe('Given: statProvider がファイル情報を返す', () => {
    /** `fileOrDirExists` を呼び出すとき。 */
    describe('When: fileOrDirExists を実行する', () => {
      /** `true` が返ることを検証する。 */
      describe('Then: T-LIB-SU-05 - true が返る', () => {
        it('T-LIB-SU-05-01: statProvider がファイル情報を返す場合、true が返る', async () => {
          assertEquals(await fileOrDirExists('/some/file.md', _existsFileStat), true);
        });
      });
    });
  });

  /**
   * `statProvider` がディレクトリ情報を返す前提条件グループ。
   *
   * ディレクトリとして存在するパスに対しても `true` が返ることを検証する。
   */
  describe('Given: statProvider がディレクトリ情報を返す', () => {
    /** `fileOrDirExists` を呼び出すとき。 */
    describe('When: fileOrDirExists を実行する', () => {
      /** `true` が返ることを検証する。 */
      describe('Then: T-LIB-SU-06 - true が返る', () => {
        it('T-LIB-SU-06-01: statProvider がディレクトリ情報を返す場合、true が返る', async () => {
          assertEquals(await fileOrDirExists('/some/dir', _existsDirStat), true);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 例外をスローする前提条件グループ。
   *
   * パスが存在しない場合に `false` が返ることを検証する。
   */
  describe('Given: statProvider が NotFound 例外をスローする', () => {
    /** `fileOrDirExists` を呼び出すとき。 */
    describe('When: fileOrDirExists を実行する', () => {
      /** `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-07 - false が返る', () => {
        it('T-LIB-SU-07-01: statProvider が NotFound をスローする場合、false が返る', async () => {
          assertEquals(await fileOrDirExists('/nonexistent/path', _notFoundStat), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 以外の例外をスローする前提条件グループ。
   *
   * パーミッションエラーなど回復不可能なエラーは握りつぶさず再スローすることを検証する。
   */
  describe('Given: statProvider が PermissionDenied 例外をスローする', () => {
    /** `fileOrDirExists` を呼び出すとき。 */
    describe('When: fileOrDirExists を実行する', () => {
      /** `PermissionDenied` が再スローされることを検証する。 */
      describe('Then: T-LIB-SU-08 - PermissionDenied が再スローされる', () => {
        it('T-LIB-SU-08-01: statProvider が PermissionDenied をスローする場合、そのまま再スローされる', async () => {
          await assertRejects(
            () => fileOrDirExists('/restricted/path', _permissionDeniedStat),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });
});

/**
 * `dirExists` 関数のユニットテストスイート。
 *
 * `dirExists(path, statProvider?)` は `statProvider` の成否と `isDirectory` フラグで
 * ディレクトリ存在を判定し、ディレクトリなら `true`、ファイルや不在なら `false` を返す。
 *
 * テスト ID 範囲: T-LIB-SU-09 〜 T-LIB-SU-12
 *
 * @see dirExists
 */
describe('dirExists', () => {
  /**
   * `statProvider` がディレクトリ情報を返す前提条件グループ。
   *
   * ディレクトリとして存在するパスに対して `true` が返ることを検証する。
   */
  describe('Given: statProvider がディレクトリ情報を返す', () => {
    /** `dirExists` を呼び出すとき。 */
    describe('When: dirExists を実行する', () => {
      /** `true` が返ることを検証する。 */
      describe('Then: T-LIB-SU-09 - true が返る', () => {
        it('T-LIB-SU-09-01: statProvider が isDirectory:true を返す場合、true が返る', async () => {
          assertEquals(await dirExists('/some/dir', _existsDirStat), true);
        });
      });
    });
  });

  /**
   * `statProvider` がファイル情報を返す前提条件グループ。
   *
   * ファイルとして存在するパスに対して `false` が返ることを検証する（ディレクトリではないため）。
   */
  describe('Given: statProvider がファイル情報を返す（isDirectory: false）', () => {
    /** `dirExists` を呼び出すとき。 */
    describe('When: dirExists を実行する', () => {
      /** ファイルはディレクトリではないため `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-10 - false が返る', () => {
        it('T-LIB-SU-10-01: statProvider が isDirectory:false を返す場合、false が返る', async () => {
          assertEquals(await dirExists('/some/file.md', _existsFileStat), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 例外をスローする前提条件グループ。
   *
   * パスが存在しない場合に `false` が返ることを検証する。
   */
  describe('Given: statProvider が NotFound 例外をスローする', () => {
    /** `dirExists` を呼び出すとき。 */
    describe('When: dirExists を実行する', () => {
      /** `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-11 - false が返る', () => {
        it('T-LIB-SU-11-01: statProvider が NotFound をスローする場合、false が返る', async () => {
          assertEquals(await dirExists('/nonexistent/dir', _notFoundStat), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 以外の例外をスローする前提条件グループ。
   *
   * パーミッションエラーなど回復不可能なエラーは握りつぶさず再スローすることを検証する。
   */
  describe('Given: statProvider が PermissionDenied 例外をスローする', () => {
    /** `dirExists` を呼び出すとき。 */
    describe('When: dirExists を実行する', () => {
      /** `PermissionDenied` が再スローされることを検証する。 */
      describe('Then: T-LIB-SU-12 - PermissionDenied が再スローされる', () => {
        it('T-LIB-SU-12-01: statProvider が PermissionDenied をスローする場合、そのまま再スローされる', async () => {
          await assertRejects(
            () => dirExists('/restricted/dir', _permissionDeniedStat),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });
});

/**
 * `dirExistsSync` 関数のユニットテストスイート。
 *
 * `dirExistsSync(path, statProvider?)` は `statProvider` の成否と `isDirectory` フラグで
 * ディレクトリ存在を同期的に判定し、ディレクトリなら `true`、ファイルや不在なら `false` を返す。
 *
 * テスト ID 範囲: T-LIB-SU-13 〜 T-LIB-SU-16
 *
 * @see dirExistsSync
 */
describe('dirExistsSync', () => {
  /**
   * `statProvider` がディレクトリ情報を返す前提条件グループ。
   *
   * ディレクトリとして存在するパスに対して `true` が返ることを検証する。
   */
  describe('Given: statProvider がディレクトリ情報を返す', () => {
    /** `dirExistsSync` を呼び出すとき。 */
    describe('When: dirExistsSync を実行する', () => {
      /** `true` が返ることを検証する。 */
      describe('Then: T-LIB-SU-13 - true が返る', () => {
        it('T-LIB-SU-13-01: statProvider が isDirectory:true を返す場合、true が返る', () => {
          assertEquals(dirExistsSync('/some/dir', _existsDirStatSync), true);
        });
      });
    });
  });

  /**
   * `statProvider` がファイル情報を返す前提条件グループ。
   *
   * ファイルとして存在するパスに対して `false` が返ることを検証する（ディレクトリではないため）。
   */
  describe('Given: statProvider がファイル情報を返す（isDirectory: false）', () => {
    /** `dirExistsSync` を呼び出すとき。 */
    describe('When: dirExistsSync を実行する', () => {
      /** ファイルはディレクトリではないため `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-14 - false が返る', () => {
        it('T-LIB-SU-14-01: statProvider が isDirectory:false を返す場合、false が返る', () => {
          assertEquals(dirExistsSync('/some/file.md', _existsFileStatSync), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 例外をスローする前提条件グループ。
   *
   * パスが存在しない場合に `false` が返ることを検証する。
   */
  describe('Given: statProvider が NotFound 例外をスローする', () => {
    /** `dirExistsSync` を呼び出すとき。 */
    describe('When: dirExistsSync を実行する', () => {
      /** `false` が返ることを検証する。 */
      describe('Then: T-LIB-SU-15 - false が返る', () => {
        it('T-LIB-SU-15-01: statProvider が NotFound をスローする場合、false が返る', () => {
          assertEquals(dirExistsSync('/nonexistent/dir', _notFoundStatSync), false);
        });
      });
    });
  });

  /**
   * `statProvider` が `NotFound` 以外の例外をスローする前提条件グループ。
   *
   * パーミッションエラーなど回復不可能なエラーは握りつぶさず再スローすることを検証する。
   */
  describe('Given: statProvider が PermissionDenied 例外をスローする', () => {
    /** `dirExistsSync` を呼び出すとき。 */
    describe('When: dirExistsSync を実行する', () => {
      /** `PermissionDenied` が再スローされることを検証する。 */
      describe('Then: T-LIB-SU-16 - PermissionDenied が再スローされる', () => {
        it('T-LIB-SU-16-01: statProvider が PermissionDenied をスローする場合、そのまま再スローされる', () => {
          assertThrows(
            () => dirExistsSync('/restricted/dir', _permissionDeniedStatSync),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });
});
