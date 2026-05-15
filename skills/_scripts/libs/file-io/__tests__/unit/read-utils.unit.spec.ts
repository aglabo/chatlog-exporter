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

// ─── Tests

/**
 * `readTextFile` 関数のユニットテストスイート。
 *
 * `readTextFile(path, readProvider?)` はファイルを読み込み LF 正規化した文字列を返す。
 * ファイルが存在しない場合は `ChatlogError('FileDirNotFound')` を throw し、
 * その他のエラー（PermissionDenied 等）はそのまま再 throw する。
 *
 * テスト ID 範囲: T-LIB-U-RF-01 〜 T-LIB-U-RF-04
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
            () => readTextFile('/nonexistent/path.md', _notFoundProvider),
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
            () => readTextFile('/restricted/path.md', _permissionDeniedProvider),
            Deno.errors.PermissionDenied,
          );
        });
      });
    });
  });
});
