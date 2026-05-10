// src: skills/_scripts/libs/file-ops/__tests__/functional/find-files.functional.spec.ts
// @(#): findFiles の機能テスト - 実ファイルシステムを使った検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// -- test target --
import { findFiles } from '../../find-files.ts';

// ─────────────────────────────────────────────
// セットアップ
// ─────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await Deno.makeTempDir();
});

afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

// ─────────────────────────────────────────────
// T-LIB-FF-F-01: デフォルト拡張子 .md の取得
// ─────────────────────────────────────────────

describe('findFiles', () => {
  describe('Given: フラットなディレクトリに .md ファイルが3件ある', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-01 - .md ファイル3件がソート済みで返る', () => {
        it('T-LIB-FF-F-01-01: 3件の .md ファイルが返る', async () => {
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');
          await Deno.writeTextFile(`${tempDir}/b.md`, '# B');

          const _result = await findFiles(tempDir);

          assertEquals(_result.length, 3);
        });

        it('T-LIB-FF-F-01-02: 結果が辞書順ソートされている', async () => {
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');
          await Deno.writeTextFile(`${tempDir}/b.md`, '# B');

          const _result = await findFiles(tempDir);
          const _sorted = [..._result].sort();

          assertEquals(_result, _sorted);
        });

        it('T-LIB-FF-F-01-03: 各パスが tempDir/<filename> 形式になっている', async () => {
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');

          const _result = await findFiles(tempDir);

          assertEquals(_result[0].endsWith('a.md'), true);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-F-02: サブディレクトリの再帰走査
  // ─────────────────────────────────────────────

  describe('Given: サブディレクトリ配下にも .md ファイルがある', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-02 - 再帰的にすべて収集される', () => {
        it('T-LIB-FF-F-02-01: ルートとサブディレクトリの .md ファイルが合計2件返る', async () => {
          const subDir = `${tempDir}/sub`;
          await Deno.mkdir(subDir, { recursive: true });
          await Deno.writeTextFile(`${tempDir}/root.md`, '# Root');
          await Deno.writeTextFile(`${subDir}/sub.md`, '# Sub');

          const _result = await findFiles(tempDir);

          assertEquals(_result.length, 2);
        });

        it('T-LIB-FF-F-02-02: 3階層ネストの .md ファイルすべてが返る', async () => {
          const subDir1 = `${tempDir}/sub1`;
          const subDir2 = `${tempDir}/sub1/sub2`;
          await Deno.mkdir(subDir2, { recursive: true });
          await Deno.writeTextFile(`${tempDir}/a.md`, '# A');
          await Deno.writeTextFile(`${subDir1}/b.md`, '# B');
          await Deno.writeTextFile(`${subDir2}/c.md`, '# C');

          const _result = await findFiles(tempDir);

          assertEquals(_result.length, 3);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-F-03: 拡張子フィルタリング
  // ─────────────────────────────────────────────

  describe('Given: .md, .txt, .yaml が混在するディレクトリ', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-03 - .md のみが返る', () => {
        it('T-LIB-FF-F-03-01: .md ファイルのみ1件返る', async () => {
          await Deno.writeTextFile(`${tempDir}/note.md`, '# MD');
          await Deno.writeTextFile(`${tempDir}/readme.txt`, 'text');
          await Deno.writeTextFile(`${tempDir}/config.yaml`, 'yaml');

          const _result = await findFiles(tempDir);

          assertEquals(_result.length, 1);
        });

        it('T-LIB-FF-F-03-02: 返却されたパスが .md で終わる', async () => {
          await Deno.writeTextFile(`${tempDir}/note.md`, '# MD');
          await Deno.writeTextFile(`${tempDir}/readme.txt`, 'text');

          const _result = await findFiles(tempDir);

          assertEquals(_result.every((p: string) => p.endsWith('.md')), true);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-F-04: 空ディレクトリ・存在しないディレクトリ
  // ─────────────────────────────────────────────

  describe('Given: 空のディレクトリ', () => {
    describe('When: findFiles(dir) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-04 - 空配列が返る', () => {
        it('T-LIB-FF-F-04-01: 空配列が返る', async () => {
          const _result = await findFiles(tempDir);

          assertEquals(_result, []);
        });
      });
    });
  });

  describe('Given: 存在しないディレクトリパス', () => {
    describe('When: findFiles(nonexistentDir) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-05 - 空配列が返る（例外なし）', () => {
        it('T-LIB-FF-F-05-01: 例外がスローされずに空配列が返る', async () => {
          const _result = await findFiles(`${tempDir}/nonexistent`);

          assertEquals(_result, []);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-F-06: ext オプションで拡張子を指定
  // ─────────────────────────────────────────────

  describe('Given: .txt ファイルが2件ある（.md なし）', () => {
    describe('When: findFiles(dir, { ext: ".txt" }) を呼び出す', () => {
      describe('Then: T-LIB-FF-F-06 - .txt ファイルのみ返す', () => {
        it('T-LIB-FF-F-06-01: .txt ファイル2件が返る', async () => {
          await Deno.writeTextFile(`${tempDir}/a.txt`, 'A');
          await Deno.writeTextFile(`${tempDir}/b.txt`, 'B');
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');

          const _result = await findFiles(tempDir, { ext: '.txt' });

          assertEquals(_result.length, 2);
        });

        it('T-LIB-FF-F-06-02: 返却されるパスがすべて ".txt" で終わる', async () => {
          await Deno.writeTextFile(`${tempDir}/a.txt`, 'A');
          await Deno.writeTextFile(`${tempDir}/b.txt`, 'B');
          await Deno.writeTextFile(`${tempDir}/c.md`, '# C');

          const _result = await findFiles(tempDir, { ext: '.txt' });

          assertEquals(_result.every((p: string) => p.endsWith('.txt')), true);
        });
      });
    });
  });
});
