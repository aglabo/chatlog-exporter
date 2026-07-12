// src: skills/_scripts/libs/file-io/__tests__/system/read-utils.system.spec.ts
// @(#): readTextFile のシステムテスト（Deno ファイルシステム実使用）
//       対象: readTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { readTextFile } from '../../read-utils.ts';

// ─── Tests

/**
 * `readTextFile` のシステムテストスイート。
 *
 * ファイルパスの中間コンポーネントがファイルであるパス（`<file>/<child>`）を実際に読み込み、
 * 実ファイルシステム上で発生する I/O エラーに対する throw / swallow 挙動を検証する。
 *
 * テスト ID 範囲: T-LIB-S-RF-01 〜 T-LIB-S-RF-02
 *
 * @see readTextFile
 */
describe('readTextFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'read-utils-system-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /**
   * ファイルパスの配下を読み込もうとするケースの実 I/O 挙動テスト。
   *
   * `<tmpDir>/file.md` をファイルとして作成し、その配下パス `<tmpDir>/file.md/child.md` を
   * `readTextFile` で読み込ませることで、ファイルをディレクトリとして扱おうとする I/O エラーを再現する。
   */
  describe('readTextFile', () => {
    /** デフォルト挙動（throwFileIoError 省略）で例外がそのまま伝播するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-S-RF-01: throwFileIoError 省略 → ファイルI/Oエラーがスローされる', async () => {
        // arrange
        const filePath = `${tmpDir}/file.md`;
        await Deno.writeTextFile(filePath, 'content');
        const childPath = `${filePath}/child.md`;

        // act & assert
        await assertRejects(() => readTextFile(childPath));
      });

      it('[Normal] T-LIB-S-RF-02: throwFileIoError: false → 例外を投げず空文字列が返る', async () => {
        // arrange
        const filePath = `${tmpDir}/file.md`;
        await Deno.writeTextFile(filePath, 'content');
        const childPath = `${filePath}/child.md`;

        // act
        const result = await readTextFile(childPath, { throwFileIoError: false });

        // assert
        assertEquals(result, '');
      });
    });
  });
});
