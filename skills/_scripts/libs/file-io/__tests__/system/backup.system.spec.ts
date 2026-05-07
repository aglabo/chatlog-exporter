// src: scripts/libs/__tests__/system/backup.system.spec.ts
// @(#): backupOldPath のシステムテスト（Deno ファイルシステム実使用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

import { backupOldPath } from '../../backup.ts';
import { fileExists, fileOrDirExists } from '../../exists-utils.ts';

// ─────────────────────────────────────────────
// backupOldPath
// ─────────────────────────────────────────────

/**
 * `backupOldPath` のシステムテストスイート。
 *
 * Deno.makeTempDir を使った実ファイルシステムテストで
 * バックアップ連番生成・スロット管理の各ケースをカバーする。
 *
 * @see backupOldPath
 */
describe('backupOldPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'backup-lib-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  // ─── グループ01: ファイルが存在しない場合 ──────────────────────────────────

  describe('Given: outputPath が存在しない', () => {
    describe('When: backupOldPath を呼ぶ', () => {
      describe('Then: T-LIB-B-01 - 何もせず正常終了する', () => {
        it('T-LIB-B-01-01: Promise が reject されない（エラーなし）', async () => {
          const outputPath = `${tmpDir}/nonexistent.md`;

          // act & assert (例外がスローされないことを確認)
          await backupOldPath(outputPath);
        });
      });
    });
  });

  // ─── グループ02: バックアップが1件もない場合 ───────────────────────────────

  describe('Given: outputPath が存在し、バックアップファイルがない', () => {
    describe('When: backupOldPath を呼ぶ', () => {
      describe('Then: T-LIB-B-02 - .old-01.md にリネームされる', () => {
        it('T-LIB-B-02-01: <basename>.old-01.md が存在する', async () => {
          // arrange
          const outputPath = `${tmpDir}/output.md`;
          await Deno.writeTextFile(outputPath, 'original content');

          // act
          await backupOldPath(outputPath);

          // assert
          const backupPath = `${tmpDir}/output.old-01.md`;
          assertEquals(await fileExists(backupPath), true);
        });

        it('T-LIB-B-02-02: 元のファイルが存在しなくなる', async () => {
          // arrange
          const outputPath = `${tmpDir}/output.md`;
          await Deno.writeTextFile(outputPath, 'original content');

          // act
          await backupOldPath(outputPath);

          // assert
          assertEquals(await fileOrDirExists(outputPath), false);
        });
      });
    });
  });

  // ─── グループ03: .old-01.md が既存の場合 ───────────────────────────────────

  describe('Given: outputPath が存在し、.old-01.md が既存', () => {
    describe('When: backupOldPath を呼ぶ', () => {
      describe('Then: T-LIB-B-03 - .old-02.md にリネームされる', () => {
        it('T-LIB-B-03-01: <basename>.old-02.md が存在する', async () => {
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
      });
    });
  });

  // ─── グループ04: サブディレクトリ付きパス ─────────────────────────────────

  describe('Given: outputPath がサブディレクトリ付き（dir/file.md）', () => {
    describe('When: backupOldPath を呼ぶ', () => {
      describe('Then: T-LIB-B-04 - サブディレクトリ内で .old-01.md にリネームされる', () => {
        it('T-LIB-B-04-01: サブディレクトリ内の <basename>.old-01.md が存在する', async () => {
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
});
