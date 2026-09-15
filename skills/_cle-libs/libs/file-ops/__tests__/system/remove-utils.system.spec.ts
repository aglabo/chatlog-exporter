// src: skills/_cle-libs/libs/file-ops/__tests__/system/remove-utils.system.spec.ts
// @(#): removeFile のシステムテスト（Deno ファイルシステム実使用）
//       対象: removeFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { removeFile } from '../../remove-utils.ts';

// ─── Helpers
import { fileExists } from '../../exists-utils.ts';

// ─── Tests

/**
 * `removeFile` のシステムテストスイート。
 *
 * `removeProvider` を注入せず、デフォルト実装（`Deno.remove`）で実ファイルが削除されることを検証する。
 *
 * テスト ID 範囲: T-LIB-RF-06-01 〜 T-LIB-RF-06-02
 *
 * @see removeFile
 */
describe('removeFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: 'remove-utils-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tempDir, { recursive: true });
  });

  /** デフォルトの removeProvider で実ファイルを削除する正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-RF-06-01: removeProvider 未指定で実在ファイルを削除すると true が返る', async () => {
      const _filePath = `${tempDir}/target.md`;
      await Deno.writeTextFile(_filePath, '# target');

      assertEquals(await removeFile(_filePath), true);
    });

    it('[Normal] T-LIB-RF-06-02: removeProvider 未指定で削除した後、ファイルが存在しない', async () => {
      const _filePath = `${tempDir}/target.md`;
      await Deno.writeTextFile(_filePath, '# target');

      await removeFile(_filePath);

      assertEquals(await fileExists(_filePath), false);
    });
  });
});
