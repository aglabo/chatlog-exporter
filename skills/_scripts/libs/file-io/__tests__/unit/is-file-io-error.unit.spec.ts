// src: skills/_scripts/libs/__tests__/file-io/unit/is-file-io-error.unit.spec.ts
// @(#): isFileIoError ユニットテスト
//       対象: isFileIoError
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words FIOE

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { isFileIoError } from '../../read-utils.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Tests

/**
 * `isFileIoError` 関数のユニットテストスイート。
 *
 * `isFileIoError(error)` は渡された値がファイル I/O 起因の `Deno.errors.*` インスタンスかどうかを判定する。
 * 該当する場合は `true`、それ以外の値（通常の `Error` / `ChatlogError` / `Error` 以外の値）は `false` を返す。
 *
 * テスト ID 範囲: T-LIB-U-FIOE-01 〜 T-LIB-U-FIOE-02
 *
 * @see isFileIoError
 */
describe('isFileIoError', () => {
  /**
   * ファイル I/O 起因の Deno エラーを渡す前提条件グループ。
   *
   * 各 `Deno.errors.*` インスタンスに対して `true` を返すことを検証する。
   */
  describe('Given: ファイル I/O 起因の Deno エラーを渡す', () => {
    // constants
    /** ファイル I/O 起因の Deno エラーインスタンス一覧。それぞれ `true` を返すことを検証する。 */
    const _fileIoErrorCases = [
      { label: 'Deno.errors.NotFound', error: new Deno.errors.NotFound('no such file') },
      { label: 'Deno.errors.PermissionDenied', error: new Deno.errors.PermissionDenied('permission denied') },
      { label: 'Deno.errors.IsADirectory', error: new Deno.errors.IsADirectory('is a directory') },
      { label: 'Deno.errors.NotADirectory', error: new Deno.errors.NotADirectory('not a directory') },
      { label: 'Deno.errors.FilesystemLoop', error: new Deno.errors.FilesystemLoop('filesystem loop') },
      { label: 'Deno.errors.NotCapable', error: new Deno.errors.NotCapable('not capable') },
      { label: 'Deno.errors.Busy', error: new Deno.errors.Busy('busy') },
      { label: 'Deno.errors.Interrupted', error: new Deno.errors.Interrupted('interrupted') },
      { label: 'Deno.errors.InvalidData', error: new Deno.errors.InvalidData('invalid data') },
    ] as const;

    /** isFileIoError を実行するとき。 */
    describe('When: isFileIoError を実行する', () => {
      /** true が返ることを検証する。 */
      describe('Then: T-LIB-U-FIOE-01 - true が返る', () => {
        for (const { label, error } of _fileIoErrorCases) {
          it(`T-LIB-U-FIOE-01: ${label} を渡すと true が返る`, () => {
            assertEquals(isFileIoError(error), true);
          });
        }
      });
    });
  });

  /**
   * ファイル I/O 起因ではない値を渡す前提条件グループ。
   *
   * 通常の `Error` / `ChatlogError` / `Error` 以外の値に対して `false` を返すことを検証する。
   */
  describe('Given: ファイル I/O 起因ではない値を渡す', () => {
    // constants
    /** ファイル I/O 起因ではない値一覧。それぞれ `false` を返すことを検証する。 */
    const _nonFileIoErrorCases = [
      { label: '通常の Error', error: new Error('some error') },
      { label: 'ChatlogError', error: new ChatlogError('FileDirNotFound', 'NotFound', 'path') },
      { label: 'undefined', error: undefined },
      { label: 'null', error: null },
      { label: '文字列', error: 'some error' },
      { label: 'オブジェクトリテラル', error: { message: 'some error' } },
    ] as const;

    /** isFileIoError を実行するとき。 */
    describe('When: isFileIoError を実行する', () => {
      /** false が返ることを検証する。 */
      describe('Then: T-LIB-U-FIOE-02 - false が返る', () => {
        for (const { label, error } of _nonFileIoErrorCases) {
          it(`T-LIB-U-FIOE-02: ${label} を渡すと false が返る`, () => {
            assertEquals(isFileIoError(error), false);
          });
        }
      });
    });
  });
});
