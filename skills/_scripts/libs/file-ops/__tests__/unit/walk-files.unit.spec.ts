// src: skills/_scripts/libs/file-ops/__tests__/unit/walk-files.unit.spec.ts
// @(#): walk-files ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// -- test target --
import { walkFiles } from '../../walk-files.ts';

// ─────────────────────────────────────────────
// テスト用 Deno.readDir モック
// ─────────────────────────────────────────────

type FakeDirEntry = { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean };
type ReadDirFn = (path: string | URL) => AsyncIterable<Deno.DirEntry>;

let origReadDir: ReadDirFn;

function _mockReadDir(map: Record<string, FakeDirEntry[]>): void {
  // deno-lint-ignore no-explicit-any
  (Deno as any).readDir = async function*(dir: string): AsyncGenerator<FakeDirEntry> {
    const entries = map[dir] ?? [];
    for (const e of entries) {
      yield e;
    }
  };
}

// ─────────────────────────────────────────────
// walkFiles
// ─────────────────────────────────────────────

describe('walkFiles', () => {
  beforeEach(() => {
    origReadDir = Deno.readDir as unknown as ReadDirFn;
  });

  afterEach(() => {
    // deno-lint-ignore no-explicit-any
    (Deno as any).readDir = origReadDir;
  });

  // ─── 正常系 ───────────────────────────────────────────────────────

  describe('Given: .md ファイルが 3 件存在するディレクトリ', () => {
    describe('When: walkFiles を .md 拡張子で実行する', () => {
      describe('Then: T-LIB-W-01 - 辞書順にファイルパスを yield する', () => {
        it('T-LIB-W-01-01: 3 件のファイルが辞書順で返る', async () => {
          _mockReadDir({
            '/fake': [
              { name: 'c.md', isFile: true, isDirectory: false, isSymlink: false },
              { name: 'a.md', isFile: true, isDirectory: false, isSymlink: false },
              { name: 'b.md', isFile: true, isDirectory: false, isSymlink: false },
            ],
          });

          const results: string[] = [];
          for await (const f of walkFiles('/fake', '.md')) {
            results.push(f);
          }

          assertEquals(results, ['/fake/a.md', '/fake/b.md', '/fake/c.md']);
        });
      });
    });
  });

  describe('Given: サブディレクトリ sub/ に .md ファイルが存在する', () => {
    describe('When: walkFiles をルートから実行する', () => {
      describe('Then: T-LIB-W-02 - サブディレクトリを再帰走査してファイルを yield する', () => {
        it('T-LIB-W-02-01: ルートとサブディレクトリのファイルが辞書順で返る', async () => {
          _mockReadDir({
            '/root': [
              { name: 'file.md', isFile: true, isDirectory: false, isSymlink: false },
              { name: 'sub', isFile: false, isDirectory: true, isSymlink: false },
            ],
            '/root/sub': [
              { name: 'nested.md', isFile: true, isDirectory: false, isSymlink: false },
            ],
          });

          const results: string[] = [];
          for await (const f of walkFiles('/root', '.md')) {
            results.push(f);
          }

          assertEquals(results, ['/root/file.md', '/root/sub/nested.md']);
        });
      });
    });
  });

  describe('Given: .txt ファイルと .md ファイルが混在するディレクトリ', () => {
    describe('When: walkFiles を .md 拡張子で実行する', () => {
      describe('Then: T-LIB-W-03 - .md ファイルのみ yield される', () => {
        it('T-LIB-W-03-01: .txt ファイルは結果に含まれない', async () => {
          _mockReadDir({
            '/mixed': [
              { name: 'note.md', isFile: true, isDirectory: false, isSymlink: false },
              { name: 'data.txt', isFile: true, isDirectory: false, isSymlink: false },
              { name: 'readme.md', isFile: true, isDirectory: false, isSymlink: false },
            ],
          });

          const results: string[] = [];
          for await (const f of walkFiles('/mixed', '.md')) {
            results.push(f);
          }

          assertEquals(results, ['/mixed/note.md', '/mixed/readme.md']);
        });
      });
    });
  });

  // ─── エラー系 ─────────────────────────────────────────────────────

  describe('Given: 存在しないディレクトリ（readDir が例外を throw）', () => {
    describe('When: walkFiles を実行する', () => {
      describe('Then: T-LIB-W-04 - 結果が空になる（エラーを黙認する）', () => {
        it('T-LIB-W-04-01: readDir が throw しても空の結果が返る', async () => {
          // deno-lint-ignore no-explicit-any require-yield
          (Deno as any).readDir = async function*(): AsyncGenerator<never> {
            throw new Deno.errors.NotFound('not found');
          };

          const results: string[] = [];
          for await (const f of walkFiles('/nonexistent', '.md')) {
            results.push(f);
          }

          assertEquals(results, []);
        });
      });
    });
  });
});
