// src: skills/_scripts/libs/file-ops/__tests__/unit/remove-utils.unit.spec.ts
// @(#): remove-file ユニットテスト
//       対象: removeFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { removeFile } from '../../remove-utils.ts';

// ─── Internal Helpers

// functions
/** ファイルが正常に削除されることを示す `RemoveProvider` モック。void を resolve する。 */
const _removeOk = (_path: string): Promise<void> => Promise.resolve();

/** ファイルが存在しないことを示す `RemoveProvider` モック。`Deno.errors.NotFound` を reject する。 */
const _removeNotFound = (_path: string): Promise<void> => Promise.reject(new Deno.errors.NotFound('no such file'));

/** 権限不足を示す `RemoveProvider` モック。`Deno.errors.PermissionDenied` を reject する。 */
const _removePermissionDenied = (_path: string): Promise<void> =>
  Promise.reject(new Deno.errors.PermissionDenied('permission denied'));

// ─── Tests

/**
 * `removeFile` 関数のユニットテストスイート。
 *
 * `removeFile(filePath, removeProvider?)` は `removeProvider` の成否に基づいて
 * 削除成功時は `true`、ファイル不在時は `false` を返し、その他エラーは再スローする。
 *
 * テスト ID 範囲: T-LIB-RF-01 〜 T-LIB-RF-03
 *
 * @see removeFile
 */
describe('removeFile', () => {
  /**
   * `removeProvider` がファイルを正常に削除する正常系グループ。
   *
   * 削除成功時に `true` が返ることを検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-RF-01-01: removeProvider が成功する場合、true が返る', async () => {
      assertEquals(await removeFile('/some/file.md', _removeOk), true);
    });
  });

  /**
   * `removeProvider` がエラーをスローする異常系グループ。
   */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-RF-02-01: removeProvider が NotFound をスローする場合、false が返る', async () => {
      assertEquals(await removeFile('/nonexistent/file.md', _removeNotFound), false);
    });

    it('[Error] T-LIB-RF-03-01: removeProvider が PermissionDenied をスローする場合、そのまま再スローされる', async () => {
      await assertRejects(
        () => removeFile('/restricted/file.md', _removePermissionDenied),
        Deno.errors.PermissionDenied,
      );
    });
  });
});
