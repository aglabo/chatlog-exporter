// src: skills/_scripts/libs/__tests__/file-io/unit/read-utils.unit.spec.ts
// @(#): readTextFile ユニットテスト
//       対象: readTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { readTextFile } from '../../read-utils.ts';

// ─── Helpers
// types
import type { ReadTextFileProvider } from '../../../../types/providers.types.ts';
// classes
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Internal Helpers

// functions
/** `Deno.errors.NotFound` を throw する読み込みプロバイダ。 */
const _notFoundProvider: ReadTextFileProvider = (_path: string) =>
  Promise.reject(new Deno.errors.NotFound('no such file'));

/** `Deno.errors.PermissionDenied` を throw する読み込みプロバイダ。 */
const _permissionDeniedProvider: ReadTextFileProvider = (_path: string) =>
  Promise.reject(new Deno.errors.PermissionDenied('permission denied'));

/** 空文字列を返す読み込みプロバイダ。空ファイルを模倣する。 */
const _emptyProvider: ReadTextFileProvider = (_path: string) => Promise.resolve('');

/** `Deno.errors.IsADirectory` を throw する読み込みプロバイダ。 */
const _isDirProvider: ReadTextFileProvider = (_path: string) =>
  Promise.reject(new Deno.errors.IsADirectory('is a directory'));

/** `Deno.errors.NotADirectory` を throw する読み込みプロバイダ。 */
const _notADirProvider: ReadTextFileProvider = (_path: string) =>
  Promise.reject(new Deno.errors.NotADirectory('not a directory'));

/** CRLF と LF が混在するテキストを返す読み込みプロバイダ。 */
const _mixedProvider: ReadTextFileProvider = (_path: string) => Promise.resolve('line1\r\nline2\nline3\r\n');

/** ファイル I/O 起因ではない通常の `Error` を throw する読み込みプロバイダ。 */
const _genericErrorProvider: ReadTextFileProvider = (_path: string) => Promise.reject(new Error('boom'));

// ─── Tests

/**
 * `readTextFile` 関数のユニットテストスイート。
 *
 * `readTextFile(path, options?)` はファイルを読み込み LF 正規化した文字列を返す。
 * ファイルが存在しない場合は `ChatlogError('FileDirNotFound')` を throw し、
 * その他のエラー（PermissionDenied 等）はそのまま再 throw する。
 * `options.throwFileIoError: false` を指定すると、ファイル I/O 起因のエラーは
 * throw せず空文字列を返す（ファイル I/O 起因ではないエラーは throwFileIoError の値に関わらず re-throw する）。
 *
 * テスト ID 範囲: T-LIB-U-RF-01 〜 T-LIB-U-RF-11
 *
 * @see readTextFile
 */
describe('readTextFile', () => {
  /**
   * LF 改行のテキストファイルが存在する前提条件グループ。
   *
   * 正常に読み込まれ LF 正規化された文字列が返ることを検証する。
   */
  describe('Given: LF 改行のテキストファイルが存在する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** LF 正規化した文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-01 - LF 正規化した文字列が返る', () => {
        it('T-LIB-U-RF-01: 存在するファイルを読み込み LF 正規化した文字列を返す', async () => {
          const _tmpPath = await Deno.makeTempFile({ prefix: 'utils-test-rf01-' });
          try {
            const _content = 'line1\nline2\nline3';
            await Deno.writeTextFile(_tmpPath, _content);
            const _result = await readTextFile(_tmpPath);
            assertEquals(_result, _content);
          } finally {
            await Deno.remove(_tmpPath);
          }
        });
      });
    });
  });

  /**
   * CRLF 改行のテキストファイルが存在する前提条件グループ。
   *
   * CRLF が LF に正規化されることを検証する。
   */
  describe('Given: CRLF 改行のテキストファイルが存在する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** CRLF が LF に正規化された文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-02 - CRLF が LF に正規化された文字列が返る', () => {
        it('T-LIB-U-RF-02: CRLF ファイルを読み込むと LF に正規化される', async () => {
          const _tmpPath = await Deno.makeTempFile({ prefix: 'utils-test-rf02-' });
          try {
            await Deno.writeTextFile(_tmpPath, 'line1\r\nline2\r\nline3');
            const _result = await readTextFile(_tmpPath);
            assertEquals(_result, 'line1\nline2\nline3');
          } finally {
            await Deno.remove(_tmpPath);
          }
        });
      });
    });
  });

  /**
   * 存在しないファイルパスを渡す前提条件グループ。
   *
   * `Deno.errors.NotFound` を `ChatlogError('FileDirNotFound')` に変換して throw することを検証する。
   */
  describe('Given: 存在しないファイルパスを渡す', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** `ChatlogError(FileDirNotFound)` がスローされることを検証する。 */
      describe('Then: T-LIB-U-RF-03 - ChatlogError(FileDirNotFound) がスローされる', () => {
        it('T-LIB-U-RF-03: ChatlogError(FileDirNotFound) がスローされる', async () => {
          const err = await assertRejects(
            () => readTextFile('/nonexistent/path.md', { readProvider: _notFoundProvider }),
            ChatlogError,
          );
          assertEquals((err as ChatlogError).kind, 'FileDirNotFound');
          assertEquals((err as ChatlogError).subindex, 'NotFound');
        });
      });
    });
  });

  /**
   * 読み込み権限のないファイルを渡す前提条件グループ。
   *
   * `Deno.errors.PermissionDenied` はそのまま再 throw されることを検証する。
   */
  describe('Given: 読み込み権限のないファイルを渡す', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** `Deno.errors.PermissionDenied` がそのまま再スローされることを検証する。 */
      describe('Then: T-LIB-U-RF-04 - PermissionDenied がそのまま再スローされる', () => {
        it('T-LIB-U-RF-04: Deno.errors.PermissionDenied がそのまま再スローされる', async () => {
          await assertRejects(
            () => readTextFile('/restricted/path.md', { readProvider: _permissionDeniedProvider }),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });

  /**
   * 空ファイルを読む前提条件グループ。
   *
   * content が空文字列のとき空文字列がそのまま返ることを検証する。
   */
  describe('Given: 空ファイルを読む', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** 空文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-05 - 空文字列が返る', () => {
        it('T-LIB-U-RF-05: 空ファイルを読み込むと空文字列が返る', async () => {
          const _result = await readTextFile('/any/path.md', { readProvider: _emptyProvider });
          assertEquals(_result, '');
        });
      });
    });
  });

  /**
   * IsADirectory エラーが発生する前提条件グループ。
   *
   * `Deno.errors.IsADirectory` はそのまま再 throw されることを検証する。
   */
  describe('Given: IsADirectory エラーが発生する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** `Deno.errors.IsADirectory` がそのまま再スローされることを検証する。 */
      describe('Then: T-LIB-U-RF-06 - IsADirectory がそのまま再スローされる', () => {
        it('T-LIB-U-RF-06: Deno.errors.IsADirectory はそのまま再スローされる', async () => {
          await assertRejects(
            () => readTextFile('/some/dir/', { readProvider: _isDirProvider }),
            Deno.errors.IsADirectory,
          );
        });
      });
    });
  });

  /**
   * CRLF と LF が混在するテキストを渡す前提条件グループ。
   *
   * すべての CRLF が LF に正規化されることを検証する。
   */
  describe('Given: CRLF と LF が混在するテキスト', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** LF に統一された文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-07 - LF に統一された文字列が返る', () => {
        it('T-LIB-U-RF-07: CRLF と LF が混在するテキストは LF に統一される', async () => {
          const _result = await readTextFile('/any/path.md', { readProvider: _mixedProvider });
          assertEquals(_result, 'line1\nline2\nline3\n');
        });
      });
    });
  });

  /**
   * 存在しないファイルパスを渡し throwFileIoError: false を指定する前提条件グループ。
   *
   * 例外を投げず空文字列が返ることを検証する。
   */
  describe('Given: 存在しないファイルパスを渡し throwFileIoError: false を指定する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** 例外を投げず空文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-08 - 例外を投げず空文字列が返る', () => {
        it('T-LIB-U-RF-08: NotFound は例外を投げず空文字列を返す', async () => {
          const _result = await readTextFile('/nonexistent/path.md', {
            readProvider: _notFoundProvider,
            throwFileIoError: false,
          });
          assertEquals(_result, '');
        });
      });
    });
  });

  /**
   * 読み込み権限のないファイルを渡し throwFileIoError: false を指定する前提条件グループ。
   *
   * 例外を投げず空文字列が返ることを検証する。
   */
  describe('Given: 読み込み権限のないファイルを渡し throwFileIoError: false を指定する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** 例外を投げず空文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-09 - 例外を投げず空文字列が返る', () => {
        it('T-LIB-U-RF-09: PermissionDenied は例外を投げず空文字列を返す', async () => {
          const _result = await readTextFile('/restricted/path.md', {
            readProvider: _permissionDeniedProvider,
            throwFileIoError: false,
          });
          assertEquals(_result, '');
        });
      });
    });
  });

  /**
   * ファイル I/O 起因ではないエラーが発生し throwFileIoError: false を指定する前提条件グループ。
   *
   * throwFileIoError の値に関わらず、ファイル I/O 起因ではないエラーは再 throw されることを検証する。
   */
  describe('Given: ファイル I/O 起因ではないエラーが発生し throwFileIoError: false を指定する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** エラーがそのまま再スローされることを検証する。 */
      describe('Then: T-LIB-U-RF-10 - エラーがそのまま再スローされる', () => {
        it('T-LIB-U-RF-10: ファイル I/O 起因ではないエラーは throwFileIoError: false でも再スローされる', async () => {
          await assertRejects(
            () =>
              readTextFile('/any/path.md', {
                readProvider: _genericErrorProvider,
                throwFileIoError: false,
              }),
            Error,
            'boom',
          );
        });
      });
    });
  });

  /**
   * NotADirectory エラーが発生し throwFileIoError: false を指定する前提条件グループ。
   *
   * 中間パスコンポーネントがファイルであるケースを想定し、例外を投げず空文字列が返ることを検証する。
   */
  describe('Given: NotADirectory エラーが発生し throwFileIoError: false を指定する', () => {
    /** readTextFile を実行するとき。 */
    describe('When: readTextFile を実行する', () => {
      /** 例外を投げず空文字列が返ることを検証する。 */
      describe('Then: T-LIB-U-RF-11 - 例外を投げず空文字列が返る', () => {
        it('T-LIB-U-RF-11: NotADirectory は例外を投げず空文字列を返す', async () => {
          const _result = await readTextFile('/tmp/file/child.md', {
            readProvider: _notADirProvider,
            throwFileIoError: false,
          });
          assertEquals(_result, '');
        });
      });
    });
  });
});
