// src: skills/_scripts/libs/file-ops/__tests__/unit/find-entries.unit.spec.ts
// @(#): findDirectories / findEntries のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals } from '@std/assert';
import { afterAll, beforeAll, describe, it } from '@std/testing/bdd';

// -- test target --
import type { GlobProvider } from '../../../../types/providers.types.ts';
import { findDirectories, findEntries } from '../../find-entries.ts';

// ─────────────────────────────────────────────
// T-FE-01: findDirectories - サブディレクトリ一覧取得
// ─────────────────────────────────────────────

describe('findDirectories', () => {
  describe('Given: 直下に 3 つのサブディレクトリがある一時ディレクトリ', () => {
    let _tmpDir: string;

    beforeAll(async () => {
      _tmpDir = await Deno.makeTempDir();
      await Deno.mkdir(`${_tmpDir}/alpha`);
      await Deno.mkdir(`${_tmpDir}/beta`);
      await Deno.mkdir(`${_tmpDir}/gamma`);
    });

    afterAll(async () => {
      await Deno.remove(_tmpDir, { recursive: true });
    });

    describe('When: findDirectories(tmpDir) を呼び出す', () => {
      describe('Then: T-FE-01 - ソート済みフルパス 3 件が返される', () => {
        it('T-FE-01-01: サブディレクトリのフルパスが 3 件返される', async () => {
          const _result = await findDirectories(_tmpDir);

          assertEquals(_result.length, 3);
        });

        it('T-FE-01-02: 返却パスが辞書順にソートされている', async () => {
          const _result = await findDirectories(_tmpDir);

          const _sorted = [..._result].sort();
          assertEquals(_result, _sorted);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-03: findDirectories - 存在しないパスで空配列（例外なし）
  // ─────────────────────────────────────────────

  describe('Given: 存在しないディレクトリパス', () => {
    describe('When: findDirectories("/nonexistent/path") を呼び出す', () => {
      describe('Then: T-FE-03 - 例外なしで空配列が返される', () => {
        it('T-FE-03-01: 空配列が返され例外はスローされない', async () => {
          const _result = await findDirectories('/nonexistent/path/12345');

          assertEquals(_result, []);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-02: findDirectories - ファイルを除外してディレクトリのみ返す
  // ─────────────────────────────────────────────

  describe('Given: ディレクトリと通常ファイルが混在する一時ディレクトリ', () => {
    let _tmpDir2: string;

    beforeAll(async () => {
      _tmpDir2 = await Deno.makeTempDir();
      await Deno.mkdir(`${_tmpDir2}/subdir`);
      await Deno.writeTextFile(`${_tmpDir2}/file.txt`, 'hello');
    });

    afterAll(async () => {
      await Deno.remove(_tmpDir2, { recursive: true });
    });

    describe('When: findDirectories(tmpDir) を呼び出す', () => {
      describe('Then: T-FE-02 - ディレクトリのみが返される（ファイルは含まれない）', () => {
        it('T-FE-02-01: 返却件数が 1 件（ディレクトリのみ）', async () => {
          const _result = await findDirectories(_tmpDir2);

          assertEquals(_result.length, 1);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// T-FE-04: findEntries - 単一ディレクトリから glob でエントリ収集
// ─────────────────────────────────────────────

describe('findEntries', () => {
  describe('Given: 単一ディレクトリに .md ファイルが 3 件ある（glob モック）', () => {
    const _glob: GlobProvider = (pattern: string): Promise<string[]> => {
      if (pattern === '/mock/root/**/*.md') {
        return Promise.resolve(['/mock/root/c.md', '/mock/root/a.md', '/mock/root/b.md']);
      }
      return Promise.resolve([]);
    };

    describe('When: findEntries(["/mock/root"], ".md", { glob }) を呼び出す', () => {
      describe('Then: T-FE-04 - ソート済みで 3 件のパスが返される', () => {
        it('T-FE-04-01: 返却件数が 3 件', async () => {
          const _result = await findEntries(['/mock/root'], '.md', { glob: _glob });

          assertEquals(_result.length, 3);
        });

        it('T-FE-04-02: 返却配列が辞書順にソートされている', async () => {
          const _result = await findEntries(['/mock/root'], '.md', { glob: _glob });

          const _sorted = [..._result].sort();
          assertEquals(_result, _sorted);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-05: findEntries - 複数ディレクトリを統合してソート
  // ─────────────────────────────────────────────

  describe('Given: 2 つのディレクトリにそれぞれ .md ファイルがある（glob モック）', () => {
    const _glob: GlobProvider = (pattern: string): Promise<string[]> => {
      if (pattern === '/mock/dir1/**/*.md') {
        return Promise.resolve(['/mock/dir1/z.md', '/mock/dir1/a.md']);
      }
      if (pattern === '/mock/dir2/**/*.md') {
        return Promise.resolve(['/mock/dir2/m.md']);
      }
      return Promise.resolve([]);
    };

    describe('When: findEntries(["/mock/dir1", "/mock/dir2"], ".md", { glob }) を呼び出す', () => {
      describe('Then: T-FE-05 - 両ディレクトリのエントリが統合・ソートされる', () => {
        it('T-FE-05-01: 合計 3 件が返される', async () => {
          const _result = await findEntries(['/mock/dir1', '/mock/dir2'], '.md', { glob: _glob });

          assertEquals(_result.length, 3);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-08: findEntries - include オプションでフィルタリング
  // ─────────────────────────────────────────────

  describe('Given: glob が 3 件返し、うち 1 件のパスに "2026-03" を含む', () => {
    const _glob: GlobProvider = (pattern: string): Promise<string[]> => {
      if (pattern === '/mock/claude/**/*.md') {
        return Promise.resolve([
          '/mock/claude/2026-02/feb.md',
          '/mock/claude/2026-03/mar.md',
          '/mock/claude/2026-04/apr.md',
        ]);
      }
      return Promise.resolve([]);
    };

    describe('When: findEntries(["/mock/claude"], ".md", { glob, include: ["2026-03"] }) を呼び出す', () => {
      describe('Then: T-FE-08 - "2026-03" を含むパスのみ返される', () => {
        it('T-FE-08-01: 返却件数が 1 件', async () => {
          const _result = await findEntries(['/mock/claude'], '.md', {
            glob: _glob,
            include: ['2026-03'],
          });

          assertEquals(_result.length, 1);
        });

        it('T-FE-08-02: 返却パスが "2026-03" を含む', async () => {
          const _result = await findEntries(['/mock/claude'], '.md', {
            glob: _glob,
            include: ['2026-03'],
          });

          assert(_result[0].includes('2026-03'));
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-09: findEntries - include が空配列の場合はすべて通す
  // ─────────────────────────────────────────────

  describe('Given: glob が 2 件返し、include が空配列', () => {
    const _glob: GlobProvider = (pattern: string): Promise<string[]> => {
      if (pattern === '/mock/root/**/*.md') {
        return Promise.resolve(['/mock/root/a.md', '/mock/root/b.md']);
      }
      return Promise.resolve([]);
    };

    describe('When: findEntries(["/mock/root"], ".md", { glob, include: [] }) を呼び出す', () => {
      describe('Then: T-FE-09 - include 空配列はフィルタなしと同等', () => {
        it('T-FE-09-01: 2 件すべて返される', async () => {
          const _result = await findEntries(['/mock/root'], '.md', {
            glob: _glob,
            include: [],
          });

          assertEquals(_result.length, 2);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-06: findEntries - exclude オプションでフィルタリング
  // ─────────────────────────────────────────────

  describe('Given: glob が 3 件返し、うち 1 件のパスに "node_modules" を含む', () => {
    const _glob: GlobProvider = (pattern: string): Promise<string[]> => {
      if (pattern === '/mock/src/**/*.md') {
        return Promise.resolve([
          '/mock/src/a.md',
          '/mock/src/node_modules/dep.md',
          '/mock/src/b.md',
        ]);
      }
      return Promise.resolve([]);
    };

    describe('When: findEntries(["/mock/src"], ".md", { glob, exclude: ["node_modules"] }) を呼び出す', () => {
      describe('Then: T-FE-06 - node_modules を含むパスが除外され 2 件返される', () => {
        it('T-FE-06-01: 返却件数が 2 件（node_modules エントリは除外済み）', async () => {
          const _result = await findEntries(['/mock/src'], '.md', {
            glob: _glob,
            exclude: ['node_modules'],
          });

          assertEquals(_result.length, 2);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-FE-07: findEntries - dirs が空配列の場合は空配列を返す
  // ─────────────────────────────────────────────

  describe('Given: dirs が空配列', () => {
    describe('When: findEntries([], ".md") を呼び出す', () => {
      describe('Then: T-FE-07 - 空配列が返される（glob は呼ばれない）', () => {
        it('T-FE-07-01: 空配列が返される', async () => {
          const _result = await findEntries([], '.md');

          assertEquals(_result, []);
        });
      });
    });
  });
});
