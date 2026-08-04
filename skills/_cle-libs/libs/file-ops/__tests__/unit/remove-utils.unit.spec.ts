// src: skills/_cle-libs/libs/file-ops/__tests__/unit/remove-utils.unit.spec.ts
// @(#): remove-file ユニットテスト
//       対象: removeFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { removeFile } from '../../remove-utils.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../__tests__/helpers/logger-stub.ts';

// ─── Internal Helpers

// functions
/** ファイルが正常に削除されることを示す `RemoveProvider` モック。void を resolve する。 */
const _removeOk = (_path: string): Promise<void> => Promise.resolve();

/** ファイルが存在しないことを示す `RemoveProvider` モック。`Deno.errors.NotFound` を reject する。 */
const _removeNotFound = (_path: string): Promise<void> => Promise.reject(new Deno.errors.NotFound('no such file'));

/** 権限不足を示す `RemoveProvider` モック。`Deno.errors.PermissionDenied` を reject する。 */
const _removePermissionDenied = (_path: string): Promise<void> =>
  Promise.reject(new Deno.errors.PermissionDenied('permission denied'));

/** ファイル I/O 起因ではないエラーを示す `RemoveProvider` モック。`TypeError` を reject する。 */
const _removeTypeError = (_path: string): Promise<void> => Promise.reject(new TypeError('unexpected error'));

// ─── Tests

/**
 * `removeFile` 関数のユニットテストスイート。
 *
 * `removeFile(filePath, options?)` は `removeProvider` の成否に基づいて削除成功時は `true` を返す。
 * ファイル I/O 起因のエラーは `throwFileIoError`（デフォルト `true`）の値に従って
 * 再スローするか、`logger.warn` でログ出力した上で `false` を返す。
 * ファイル I/O 起因ではないエラーは常に再スローする。
 *
 * テスト ID 範囲: T-LIB-RF-01 〜 T-LIB-RF-05
 *
 * @see removeFile
 */
describe('removeFile', () => {
  let loggerStub: LoggerStub | undefined;

  afterEach(() => {
    loggerStub?.restore();
    loggerStub = undefined;
  });

  /**
   * 削除成功時の正常系グループ。
   *
   * オプション有無に関わらず `true` が返ることを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-RF-01-01: removeProvider が成功する場合、true が返る', async () => {
      assertEquals(await removeFile('/some/file.md', { removeProvider: _removeOk }), true);
    });

    it('[Normal] T-LIB-RF-01-02: throwFileIoError: false を指定しても成功時は true が返る', async () => {
      assertEquals(
        await removeFile('/some/file.md', { removeProvider: _removeOk, throwFileIoError: false }),
        true,
      );
    });
  });

  /**
   * `throwFileIoError: false` 指定時に、ファイル I/O 起因のエラーを握りつぶして
   * `logger.warn` でログ出力し `false` を返すグループ。
   */
  describe('When: throwFileIoError: false 指定時', () => {
    it('[Normal] T-LIB-RF-02-01: NotFound 発生時、logger.warn が呼ばれ false が返る', async () => {
      loggerStub = makeLoggerStub();
      const result = await removeFile('/nonexistent/file.md', {
        removeProvider: _removeNotFound,
        throwFileIoError: false,
      });
      assertEquals(result, false);
      assertEquals(loggerStub.warnLogs.length, 1);
    });

    it('[Normal] T-LIB-RF-02-02: PermissionDenied 発生時、logger.warn が呼ばれ false が返る', async () => {
      loggerStub = makeLoggerStub();
      const result = await removeFile('/restricted/file.md', {
        removeProvider: _removePermissionDenied,
        throwFileIoError: false,
      });
      assertEquals(result, false);
      assertEquals(loggerStub.warnLogs.length, 1);
    });
  });

  /**
   * `throwFileIoError` 省略時（デフォルト `true`）は、NotFound を含むファイル I/O 起因の
   * エラーがそのまま再スローされることを検証する異常系グループ。
   *
   * 現行の「NotFound は握りつぶして false を返す」動作からの破壊的変更を明示する。
   */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-RF-03-01: throwFileIoError 省略時、NotFound はそのまま再スローされる', async () => {
      await assertRejects(
        () => removeFile('/nonexistent/file.md', { removeProvider: _removeNotFound }),
        Deno.errors.NotFound,
      );
    });

    it('[Error] T-LIB-RF-03-02: throwFileIoError: true 明示時、PermissionDenied はそのまま再スローされる', async () => {
      await assertRejects(
        () => removeFile('/restricted/file.md', { removeProvider: _removePermissionDenied, throwFileIoError: true }),
        Deno.errors.PermissionDenied,
      );
    });

    it('[Error] T-LIB-RF-04-01: throwFileIoError: false でも、file-io 起因ではないエラーは再スローされる', async () => {
      await assertRejects(
        () => removeFile('/some/file.md', { removeProvider: _removeTypeError, throwFileIoError: false }),
        TypeError,
      );
    });
  });

  /**
   * `removeProvider` と `throwFileIoError` を同時に指定できることを検証するエッジケース。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-RF-05-01: removeProvider と throwFileIoError を併用できる', async () => {
      loggerStub = makeLoggerStub();
      const result = await removeFile('/nonexistent/file.md', {
        removeProvider: _removeNotFound,
        throwFileIoError: false,
      });
      assertEquals(result, false);
      assertEquals(loggerStub.warnLogs.length, 1);
    });
  });
});
