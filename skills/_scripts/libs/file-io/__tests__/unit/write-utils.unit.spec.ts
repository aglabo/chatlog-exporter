// src: skills/_scripts/libs/file-io/__tests__/unit/write-utils.unit.spec.ts
// @(#): file-io モジュールのユニットテスト
//       対象: writeTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { writeTextFile } from '../../write-utils.ts';

// ─── Helpers
import { readTextFile } from '../../read-utils.ts';

// ─── Tests

/**
 * `writeTextFile` のユニットテストスイート。
 *
 * Deno.makeTempDir を使ってテンポラリディレクトリにファイルを書き込む実際のファイル操作テスト。
 *
 * テスト ID 範囲: T-WO-01-01 〜 T-WO-01-02
 *
 * @see writeTextFile
 */
describe('writeTextFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'normalize-chatlogs-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /** 正常系: ファイルが書き込まれる */
  describe('When: 正常系', () => {
    it('[Normal] T-WO-01-01: ファイルが書き込まれる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = '# Test Content\nHello World';

      // act
      await writeTextFile(outputPath, content);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, content);
    });

    it('[Normal] T-WO-03-01: 既存ファイルはバックアップされず上書きされる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);

      // act
      await writeTextFile(outputPath, newContent);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, newContent);
      await assertRejects(() => Deno.stat(`${tmpDir}/output.old-01.md`), Deno.errors.NotFound);
    });

    it('[Normal] T-WO-03-02: rename が AlreadyExists で失敗しても既存ファイルを削除して上書きされる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);

      const origRename = Deno.rename.bind(Deno);
      let renameCallCount = 0;
      const renameStub = stub(Deno, 'rename', (from, to) => {
        renameCallCount++;
        if (renameCallCount === 1) {
          return Promise.reject(new Deno.errors.AlreadyExists('exists'));
        }
        return origRename(from, to);
      });

      try {
        // act
        await writeTextFile(outputPath, newContent);
      } finally {
        renameStub.restore();
      }

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, newContent);
      await assertRejects(() => Deno.stat(`${outputPath}.tmp`), Deno.errors.NotFound);
    });
  });

  /** 異常系: エラーをスローするケース */
  describe('When: 異常系', () => {
    it('[Error] T-WO-01-02: 出力先ディレクトリが存在しないとき NotFound エラーをスローする', async () => {
      // arrange
      const nestedPath = `${tmpDir}/sub/nested/output.md`;
      const content = '# Nested Content';

      // act & assert
      await assertRejects(
        () => writeTextFile(nestedPath, content),
        Deno.errors.NotFound,
      );
    });

    it('[Error] T-WO-03-03: rename が AlreadyExists 以外で失敗した場合はそのままエラーが伝播する', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = 'content';
      const renameStub = stub(Deno, 'rename', () => Promise.reject(new Deno.errors.PermissionDenied('denied')));

      try {
        // act & assert
        await assertRejects(
          () => writeTextFile(outputPath, content),
          Deno.errors.PermissionDenied,
        );
      } finally {
        renameStub.restore();
      }
    });
  });
});
