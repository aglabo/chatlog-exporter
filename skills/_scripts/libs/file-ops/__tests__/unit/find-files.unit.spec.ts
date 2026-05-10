// src: skills/_scripts/libs/file-ops/__tests__/unit/find-files.unit.spec.ts
// @(#): findFiles のユニットテスト - GlobProvider モックによる検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import type { GlobProvider } from '../../../../types/providers.types.ts';
import { findFiles } from '../../find-files.ts';

// ─────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────

/**
 * fileMap: dir → ファイルパス一覧
 * dirMap: dir → サブディレクトリパス一覧
 * ext: 拡張子（デフォルト ".md"）
 */
function _makeGlob(
  fileMap: Record<string, string[]>,
  dirMap: Record<string, string[]> = {},
  ext = '.md',
): GlobProvider {
  return (pattern: string): Promise<string[]> => {
    if (pattern.endsWith(`/*${ext}`)) {
      const dir = pattern.slice(0, -(2 + ext.length));
      return Promise.resolve(fileMap[dir] ?? []);
    }
    if (pattern.endsWith('/*/')) {
      const dir = pattern.slice(0, -3);
      return Promise.resolve(dirMap[dir] ?? []);
    }
    return Promise.resolve([]);
  };
}

// ─────────────────────────────────────────────
// T-LIB-FF-01: 単一階層の .md ファイル3件取得
// ─────────────────────────────────────────────

describe('findFiles', () => {
  describe('Given: 単一階層のディレクトリに .md ファイルが3件ある', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-01 - 単一階層の .md ファイル3件取得', () => {
        it('T-LIB-FF-01-01: 全3件のファイルパスが返される', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/a.md', '/mock/root/b.md', '/mock/root/c.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          assertEquals(_result.length, 3);
        });

        it('T-LIB-FF-01-02: 各パスが /mock/root/<filename> 形式になっている', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/a.md', '/mock/root/b.md', '/mock/root/c.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          assertEquals(_result.every((p) => p.startsWith('/mock/root/')), true);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-02: 3階層ディレクトリの再帰収集
  // ─────────────────────────────────────────────

  describe('Given: 3階層ネストしたディレクトリツリー', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-02 - 3階層ディレクトリの再帰収集', () => {
        it('T-LIB-FF-02-01: 全3ファイルのフルパスが返される', async () => {
          const _glob = _makeGlob(
            {
              '/mock': ['/mock/a.md'],
              '/mock/sub1': ['/mock/sub1/b.md'],
              '/mock/sub1/sub2': ['/mock/sub1/sub2/c.md'],
            },
            {
              '/mock': ['/mock/sub1'],
              '/mock/sub1': ['/mock/sub1/sub2'],
            },
          );

          const _result = await findFiles('/mock', { glob: _glob });

          assertEquals(_result.length, 3);
        });

        it('T-LIB-FF-02-02: ディレクトリエントリ (sub1, sub2) はパスに含まれない', async () => {
          const _glob = _makeGlob(
            {
              '/mock': ['/mock/a.md'],
              '/mock/sub1': ['/mock/sub1/b.md'],
              '/mock/sub1/sub2': ['/mock/sub1/sub2/c.md'],
            },
            {
              '/mock': ['/mock/sub1'],
              '/mock/sub1': ['/mock/sub1/sub2'],
            },
          );

          const _result = await findFiles('/mock', { glob: _glob });

          assertEquals(
            _result.every((p) => !p.endsWith('/sub1') && !p.endsWith('/sub2')),
            true,
          );
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-03: 辞書順ソートの保証
  // ─────────────────────────────────────────────

  describe('Given: glob が [c.md, a.md, b.md] を逆順で返す', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-03 - 辞書順ソートの保証', () => {
        it('T-LIB-FF-03-01: 返却配列が辞書順にソートされている', async () => {
          const _glob = _makeGlob({
            '/mock/root': ['/mock/root/c.md', '/mock/root/a.md', '/mock/root/b.md'],
          });

          const _result = await findFiles('/mock/root', { glob: _glob });

          const _sorted = [..._result].sort();
          assertEquals(_result, _sorted);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-04: .md 以外ファイルの除外
  // ─────────────────────────────────────────────

  describe('Given: glob が .md ファイルのみを返す（フィルタ済み）', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-04 - .md 以外ファイルの除外', () => {
        it('T-LIB-FF-04-01: .md ファイルのみが返される（1件）', async () => {
          const _glob = _makeGlob({
            '/mock/dir': ['/mock/dir/readme.md'],
          });

          const _result = await findFiles('/mock/dir', { glob: _glob });

          assertEquals(_result.length, 1);
        });

        it('T-LIB-FF-04-02: .txt/.yaml/.json ファイルは含まれない', async () => {
          const _glob = _makeGlob({
            '/mock/dir': ['/mock/dir/readme.md'],
          });

          const _result = await findFiles('/mock/dir', { glob: _glob });

          assertEquals(
            _result.some((p) => p.endsWith('.txt') || p.endsWith('.yaml') || p.endsWith('.json')),
            false,
          );
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-05: 存在しないディレクトリで空配列（例外なし）
  // ─────────────────────────────────────────────

  describe('Given: glob が空配列を返す（存在しないディレクトリ相当）', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-05 - 存在しないディレクトリで空配列（例外なし）', () => {
        it('T-LIB-FF-05-01: 例外がスローされず空配列が返される', async () => {
          const _glob = _makeGlob({});

          const _result = await findFiles('/nonexistent/dir', { glob: _glob });

          assertEquals(_result, []);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-06: ext 省略でデフォルト ".md" 動作
  // ─────────────────────────────────────────────

  describe('Given: ext オプションを未指定', () => {
    describe('When: findFiles(dir, { glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-06 - デフォルト ext ".md" で動作する', () => {
        it('T-LIB-FF-06-01: ext 省略と { ext: ".md" } の結果が一致する', async () => {
          const _glob1 = _makeGlob({ '/mock': ['/mock/a.md'] });
          const _glob2 = _makeGlob({ '/mock': ['/mock/a.md'] }, {}, '.md');

          const _r1 = await findFiles('/mock', { glob: _glob1 });
          const _r2 = await findFiles('/mock', { ext: '.md', glob: _glob2 });

          assertEquals(_r1, _r2);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-07: ext ".txt" の動作確認
  // ─────────────────────────────────────────────

  describe('Given: ext: ".txt" を指定したディレクトリに .txt ファイルが2件ある', () => {
    describe('When: findFiles(dir, { ext: ".txt", glob }) を呼び出す', () => {
      describe('Then: T-LIB-FF-07 - .txt ファイルのみ返す', () => {
        it('T-LIB-FF-07-01: .txt ファイル2件が返される', async () => {
          const _glob = _makeGlob(
            { '/mock': ['/mock/a.txt', '/mock/b.txt'] },
            {},
            '.txt',
          );

          const _result = await findFiles('/mock', { ext: '.txt', glob: _glob });

          assertEquals(_result.length, 2);
        });

        it('T-LIB-FF-07-02: 返却されるパスがすべて ".txt" で終わる', async () => {
          const _glob = _makeGlob(
            { '/mock': ['/mock/a.txt', '/mock/b.txt'] },
            {},
            '.txt',
          );

          const _result = await findFiles('/mock', { ext: '.txt', glob: _glob });

          assertEquals(_result.every((p) => p.endsWith('.txt')), true);
        });
      });
    });
  });

  // ─────────────────────────────────────────────
  // T-LIB-FF-08: ext バリデーション（ドット始まりでない場合）
  // ─────────────────────────────────────────────

  describe('Given: ext がドット始まりでない ("md")', () => {
    describe('When: findFiles(dir, { ext: "md" }) を呼び出す', () => {
      describe('Then: T-LIB-FF-08 - Error がスローされる', () => {
        it('T-LIB-FF-08-01: "ext must start with \'.\'" を含む Error がスローされる', async () => {
          const _glob = _makeGlob({});

          await assertRejects(
            () => findFiles('/mock', { ext: 'md', glob: _glob }),
            Error,
            "ext must start with '.'",
          );
        });
      });
    });
  });
});
