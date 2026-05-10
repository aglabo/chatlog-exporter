// src: skills/_scripts/libs/file-ops/__tests__/system/backup-old-path.system.spec.ts
// @(#): backupOldPath のシステムテスト（Deno ファイルシステム実使用、file-ops）
//       対象: backupOldPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { backupOldPath } from '../../backup-old-path.ts';

// ─── Helpers
import { fileExists, fileOrDirExists } from '../../exists-utils.ts';

// ─── Tests

/**
 * `backupOldPath` のシステムテストスイート（file-ops）。
 *
 * Deno.makeTempDir を使った実ファイルシステムテストで
 * バックアップ連番生成・スロット管理・ファイル不在の各ケースをカバーする。
 *
 * テスト ID 範囲: T-LIB-B-01-01 〜 T-LIB-B-04-01
 *
 * @see backupOldPath
 */
describe('backupOldPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'backup-file-ops-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /**
   * `backupOldPath` の正常系テスト。
   *
   * ファイル不在・バックアップなし・バックアップあり・サブディレクトリの各ケースを検証する。
   */
  describe('backupOldPath', () => {
    /** ファイルが存在しない場合の正常終了ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-B-01-01: outputPath が存在しない → 例外なし正常終了', async () => {
        // arrange
        const outputPath = `${tmpDir}/nonexistent.md`;

        // act & assert (例外がスローされないことを確認)
        await backupOldPath(outputPath);
      });

      it('[Normal] T-LIB-B-02-01: バックアップなし → <basename>.old-01.md が生成される', async () => {
        // arrange
        const outputPath = `${tmpDir}/output.md`;
        await Deno.writeTextFile(outputPath, 'original content');

        // act
        await backupOldPath(outputPath);

        // assert
        const backupPath = `${tmpDir}/output.old-01.md`;
        assertEquals(await fileExists(backupPath), true);
      });

      it('[Normal] T-LIB-B-02-02: バックアップなし → 元ファイルが存在しなくなる', async () => {
        // arrange
        const outputPath = `${tmpDir}/output.md`;
        await Deno.writeTextFile(outputPath, 'original content');

        // act
        await backupOldPath(outputPath);

        // assert
        assertEquals(await fileOrDirExists(outputPath), false);
      });

      it('[Normal] T-LIB-B-03-01: .old-01.md 既存 → <basename>.old-02.md が生成される', async () => {
        // arrange
        const outputPath = `${tmpDir}/output.md`;
        await Deno.writeTextFile(outputPath, 'new content');
        await Deno.writeTextFile(`${tmpDir}/output.old-01.md`, 'old content');

        // act
        await backupOldPath(outputPath);

        // assert
        const backupPath = `${tmpDir}/output.old-02.md`;
        assertEquals(await fileExists(backupPath), true);
      });

      it('[Normal] T-LIB-B-04-01: サブDir 内ファイル → サブDir内 <basename>.old-01.md が生成される', async () => {
        // arrange
        const subDir = `${tmpDir}/sub`;
        await Deno.mkdir(subDir);
        const outputPath = `${subDir}/file.md`;
        await Deno.writeTextFile(outputPath, 'content');

        // act
        await backupOldPath(outputPath);

        // assert
        const backupPath = `${subDir}/file.old-01.md`;
        assertEquals(await fileExists(backupPath), true);
      });
    });
  });
});
