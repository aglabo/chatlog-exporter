// src: scripts/__tests__/functional/set-frontmatter.find-md-files.functional.spec.ts
// @(#): findFiles の機能テスト
//       実ファイルシステムを使った .md ファイル検索の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { findFiles } from '../../../../_scripts/libs/file-ops/find-files.ts';

// ─── テスト共通セットアップ ───────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─── フラットな .md ファイル ─────────────────────────────────────────────────

describe('findFiles', () => {
  describe('Given: フラットなディレクトリに .md ファイルが3件', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-SF-FMF-01 - 3件返り、ソート済み', () => {
        it('T-SF-FMF-01-01: 3件の .md ファイルが返る', async () => {
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');
          await Deno.writeTextFile(`${tempDir}/b.md`, '# B');

          const results = await findFiles(tempDir);

          assertEquals(results.length, 3);
        });

        it('T-SF-FMF-01-02: 結果がソート済みで返る', async () => {
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');
          await Deno.writeTextFile(`${tempDir}/b.md`, '# B');

          const results = await findFiles(tempDir);
          const sorted = [...results].sort();

          assertEquals(results, sorted);
        });
      });
    });
  });

  // ─── サブディレクトリを再帰検索 ──────────────────────────────────────────

  describe('Given: サブディレクトリ配下に .md ファイルがある', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-SF-FMF-02 - 再帰的に発見される', () => {
        it('T-SF-FMF-02-01: サブディレクトリの .md ファイルも含まれる', async () => {
          const subDir = `${tempDir}/sub`;
          await Deno.mkdir(subDir, { recursive: true });
          await Deno.writeTextFile(`${tempDir}/root.md`, '# Root');
          await Deno.writeTextFile(`${subDir}/sub.md`, '# Sub');

          const results = await findFiles(tempDir);

          assertEquals(results.length, 2);
        });
      });
    });
  });

  // ─── .md 以外のファイルを除外 ────────────────────────────────────────────

  describe('Given: .txt, .yaml も混在するディレクトリ', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-SF-FMF-03 - .md のみ返る', () => {
        it('T-SF-FMF-03-01: .md のみが含まれる', async () => {
          await Deno.writeTextFile(`${tempDir}/note.md`, '# MD');
          await Deno.writeTextFile(`${tempDir}/readme.txt`, 'text');
          await Deno.writeTextFile(`${tempDir}/config.yaml`, 'yaml');

          const results = await findFiles(tempDir);

          assertEquals(results.length, 1);
          assertEquals(results[0].endsWith('.md'), true);
        });
      });
    });
  });

  // ─── 空ディレクトリ ──────────────────────────────────────────────────────

  describe('Given: 空のディレクトリ', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-SF-FMF-04 - 空配列が返る', () => {
        it('T-SF-FMF-04-01: 空配列が返る', async () => {
          const results = await findFiles(tempDir);

          assertEquals(results, []);
        });
      });
    });
  });

  // ─── 存在しないディレクトリ ──────────────────────────────────────────────

  describe('Given: 存在しないディレクトリパス', () => {
    describe('When: findFiles(nonexistentDir) を呼び出す', () => {
      describe('Then: T-SF-FMF-05 - 空配列が返る（例外なし）', () => {
        it('T-SF-FMF-05-01: 例外がスローされずに空配列が返る', async () => {
          const results = await findFiles(`${tempDir}/nonexistent`);

          assertEquals(results, []);
        });
      });
    });
  });
});
