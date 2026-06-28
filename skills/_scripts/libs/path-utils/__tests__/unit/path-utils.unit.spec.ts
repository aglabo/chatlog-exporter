// src: skills/_scripts/libs/path-utils/__tests__/unit/path-utils.unit.spec.ts
// @(#): path-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// -- test target --
import {
  getBasename,
  getDirectory,
  getFilename,
  getRelativePath,
  isAbsolutePath,
  joinPath,
  normalizePath,
  toUnixPath,
} from '../../path-utils.ts';
import { isSafePath, resolveConfigPath } from '../../resolve-path.ts';
// helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
import { resetProjectRoot } from '../../dir-utils.ts';

// ─────────────────────────────────────────────
// normalizePath
// ─────────────────────────────────────────────

describe('normalizePath', () => {
  describe('Given: バックスラッシュのみのパス', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-01 - 全てスラッシュに変換される', () => {
        it('T-LIB-U-01-01: バックスラッシュが全てスラッシュに変換される', () => {
          assertEquals(normalizePath('C:\\Users\\foo\\bar'), 'C:/Users/foo/bar');
        });
      });
    });
  });

  describe('Given: バックスラッシュとスラッシュが混在するパス', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-02 - 全てスラッシュに統一される', () => {
        it('T-LIB-U-02-01: 混在した区切り文字が全てスラッシュに統一される', () => {
          assertEquals(normalizePath('C:\\dir/sub\\file.md'), 'C:/dir/sub/file.md');
        });
      });
    });
  });

  describe('Given: スラッシュのみのパス（変換不要）', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-03 - 入力と同一の文字列が返る', () => {
        it('T-LIB-U-03-01: スラッシュ済みパスは変更されない', () => {
          assertEquals(normalizePath('/home/user/file.md'), '/home/user/file.md');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-04 - 空文字列が返る', () => {
        it('T-LIB-U-04-01: 空文字列は空文字列のまま返る', () => {
          assertEquals(normalizePath(''), '');
        });
      });
    });
  });

  describe('Given: Windows ドライブレター付きパス', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-05 - ドライブレターを保持しスラッシュに変換される', () => {
        it('T-LIB-U-05-01: C:\\Users\\foo が C:/Users/foo に変換される', () => {
          assertEquals(normalizePath('C:\\Users\\foo'), 'C:/Users/foo');
        });
      });
    });
  });

  describe('Given: URL pathname 形式のパス（/C:/...）', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-07-01 - /C:/Users/foo が C:/Users/foo に変換される', () => {
        it('T-LIB-U-07-01: /C:/Users/foo が C:/Users/foo に変換される（URL pathname 形式の修正）', () => {
          assertEquals(normalizePath('/C:/Users/foo'), 'C:/Users/foo');
        });
      });
    });
  });

  describe('Given: 末尾スラッシュ付きパス', () => {
    describe('When: normalizePath を実行する', () => {
      describe('Then: T-LIB-U-06 - 末尾スラッシュが除去される', () => {
        it('T-LIB-U-06-01: /home/user/ の末尾スラッシュが除去される', () => {
          assertEquals(normalizePath('/home/user/'), '/home/user');
        });
        it('T-LIB-U-06-02: C:\\Users\\foo\\ の末尾スラッシュが除去される', () => {
          assertEquals(normalizePath('C:\\Users\\foo\\'), 'C:/Users/foo');
        });
        it('T-LIB-U-06-03: 末尾に複数スラッシュがある場合も除去される', () => {
          assertEquals(normalizePath('/home/user///'), '/home/user');
        });
      });
    });
  });

  describe('When: 正常系 - . セグメント除去', () => {
    /** 単独ドットセグメントを除去してパスを正規化する。 */
    it('[Normal] T-LIB-U-50-01: a/./b → a/b', () => {
      assertEquals(normalizePath('a/./b'), 'a/b');
    });
    it('[Normal] T-LIB-U-50-02: ./foo → foo', () => {
      assertEquals(normalizePath('./foo'), 'foo');
    });
    it('[Normal] T-LIB-U-50-03: foo/. → foo', () => {
      assertEquals(normalizePath('foo/.'), 'foo');
    });
    it('[Normal] T-LIB-U-50-04: /a/./b/./c → /a/b/c', () => {
      assertEquals(normalizePath('/a/./b/./c'), '/a/b/c');
    });
  });

  describe('When: 異常系 - .. 禁止', () => {
    /** toUnixPath で展開できない不可約な .. セグメントは ChatlogError(InvalidPath) をスローする。展開可能な .. は正規化されて返る。 */
    it('[Normal] T-LIB-U-51-01: a/../b → b（toUnixPath で展開される）', () => {
      assertEquals(normalizePath('a/../b'), 'b');
    });
    it('[Error] T-LIB-U-51-02: ../foo → ChatlogError(InvalidPath)（不可約な先頭 ..）', () => {
      assertThrows(() => normalizePath('../foo'), ChatlogError);
    });
    it('[Normal] T-LIB-U-51-03: /foo/../../bar → /bar（toUnixPath で展開される）', () => {
      assertEquals(normalizePath('/foo/../../bar'), '/bar');
    });
    it('[Error] T-LIB-U-51-04: a/.../b（3ドット）→ ChatlogError(InvalidPath)', () => {
      assertThrows(() => normalizePath('a/.../b'), ChatlogError);
    });
  });

  describe('When: エッジケース - ドット文字を含む許可パターン', () => {
    /** .hidden や file..name はドットセグメントではないため通常通り処理される。 */
    it('[Edge] T-LIB-U-52-01: .hidden → .hidden（throw しない）', () => {
      assertEquals(normalizePath('.hidden'), '.hidden');
    });
    it('[Edge] T-LIB-U-52-02: file..name → file..name（throw しない）', () => {
      assertEquals(normalizePath('file..name'), 'file..name');
    });
    it('[Normal] T-LIB-U-52-03: C:\\a\\..\\b（バックスラッシュ含む ..）→ C:/b（toUnixPath で展開される）', () => {
      assertEquals(normalizePath('C:\\a\\..\\b'), 'C:/b');
    });
  });
});

// ─────────────────────────────────────────────
// getDirectory
// ─────────────────────────────────────────────

describe('getDirectory', () => {
  describe('Given: Unix スタイルの絶対パス', () => {
    describe('When: getDirectory を実行する', () => {
      describe('Then: T-LIB-U-08-01 - ファイル名を除いたディレクトリパスが返る', () => {
        it('T-LIB-U-08-01: /home/user/file.md から /home/user が返る', () => {
          assertEquals(getDirectory('/home/user/file.md'), '/home/user');
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュパス', () => {
    describe('When: getDirectory を実行する', () => {
      describe('Then: T-LIB-U-08-02 - バックスラッシュをスラッシュに統一したディレクトリパスが返る', () => {
        it('T-LIB-U-08-02: C:\\Users\\foo\\file.md から C:/Users/foo が返る', () => {
          assertEquals(getDirectory('C:\\Users\\foo\\file.md'), 'C:/Users/foo');
        });
      });
    });
  });

  describe('Given: バックスラッシュとスラッシュが混在するパス', () => {
    describe('When: getDirectory を実行する', () => {
      describe('Then: T-LIB-U-08-03 - 混在セパレータを統一したディレクトリパスが返る', () => {
        it('T-LIB-U-08-03: C:\\dir/sub\\file.md から C:/dir/sub が返る', () => {
          assertEquals(getDirectory('C:\\dir/sub\\file.md'), 'C:/dir/sub');
        });
      });
    });
  });

  describe('Given: セパレータなしのファイル名のみのパス', () => {
    describe('When: getDirectory を実行する', () => {
      describe('Then: T-LIB-U-08-04 - 空文字列が返る', () => {
        it('T-LIB-U-08-04: file.md（セパレータなし）から空文字列が返る', () => {
          assertEquals(getDirectory('file.md'), '');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: getDirectory を実行する', () => {
      describe('Then: T-LIB-U-08-05 - 空文字列が返る', () => {
        it('T-LIB-U-08-05: 空文字列から空文字列が返る', () => {
          assertEquals(getDirectory(''), '');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// getFilename
// ─────────────────────────────────────────────

describe('getFilename', () => {
  describe('Given: Unix パス /home/user/file.md', () => {
    describe('When: getFilename を実行する', () => {
      describe('Then: T-LIB-U-09-01 - file.md が返る', () => {
        it('T-LIB-U-09-01: Unix パスからファイル名が返る', () => {
          assertEquals(getFilename('/home/user/file.md'), 'file.md');
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュパス C:\\Users\\foo\\file.md', () => {
    describe('When: getFilename を実行する', () => {
      describe('Then: T-LIB-U-09-02 - file.md が返る', () => {
        it('T-LIB-U-09-02: Windows バックスラッシュパスからファイル名が返る', () => {
          assertEquals(getFilename('C:\\Users\\foo\\file.md'), 'file.md');
        });
      });
    });
  });

  describe('Given: 混在パス C:\\dir/sub\\file.md', () => {
    describe('When: getFilename を実行する', () => {
      describe('Then: T-LIB-U-09-03 - file.md が返る', () => {
        it('T-LIB-U-09-03: 混在パスからファイル名が返る', () => {
          assertEquals(getFilename('C:\\dir/sub\\file.md'), 'file.md');
        });
      });
    });
  });

  describe('Given: セパレータなし file.md', () => {
    describe('When: getFilename を実行する', () => {
      describe('Then: T-LIB-U-09-04 - file.md が返る', () => {
        it('T-LIB-U-09-04: セパレータなしパスからファイル名がそのまま返る', () => {
          assertEquals(getFilename('file.md'), 'file.md');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: getFilename を実行する', () => {
      describe('Then: T-LIB-U-09-05 - 空文字列が返る', () => {
        it('T-LIB-U-09-05: 空文字列から空文字列が返る', () => {
          assertEquals(getFilename(''), '');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// isAbsolutePath
// ─────────────────────────────────────────────

describe('isAbsolutePath', () => {
  describe('Given: Unix スタイルの絶対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-01 - true が返る', () => {
        it('T-LIB-U-12-01: /home/user は絶対パスと判定される', () => {
          assert(isAbsolutePath('/home/user'));
        });
      });
      describe('Then: T-LIB-U-12-02 - true が返る', () => {
        it('T-LIB-U-12-02: /etc/config は絶対パスと判定される', () => {
          assert(isAbsolutePath('/etc/config'));
        });
      });
      describe('Then: T-LIB-U-12-03 - true が返る', () => {
        it('T-LIB-U-12-03: / は絶対パスと判定される', () => {
          assert(isAbsolutePath('/'));
        });
      });
    });
  });

  describe('Given: 相対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-04 - false が返る', () => {
        it('T-LIB-U-12-04: relative/path は絶対パスではないと判定される', () => {
          assertFalse(isAbsolutePath('relative/path'));
        });
      });
      describe('Then: T-LIB-U-12-05 - false が返る', () => {
        it('T-LIB-U-12-05: ./relative は絶対パスではないと判定される', () => {
          assertFalse(isAbsolutePath('./relative'));
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-07 - false が返る', () => {
        it('T-LIB-U-12-07: 空文字列は絶対パスではないと判定される', () => {
          assertFalse(isAbsolutePath(''));
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュ絶対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-08 - true が返る', () => {
        it('T-LIB-U-12-08: C:\\Users\\foo は絶対パスと判定される', () => {
          assert(isAbsolutePath('C:\\Users\\foo'));
        });
      });
      describe('Then: T-LIB-U-12-09 - true が返る', () => {
        it('T-LIB-U-12-09: D:/data は絶対パスと判定される', () => {
          assert(isAbsolutePath('D:/data'));
        });
      });
      describe('Then: T-LIB-U-12-10 - true が返る', () => {
        it('T-LIB-U-12-10: c:/path は絶対パスと判定される（小文字ドライブレター）', () => {
          assert(isAbsolutePath('c:/path'));
        });
      });
    });
  });

  describe('Given: Windows ドライブレター付き相対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-11 - false が返る', () => {
        it('T-LIB-U-12-11: C:foo は絶対パスではないと判定される', () => {
          assertFalse(isAbsolutePath('C:foo'));
        });
      });
    });
  });

  describe('Given: UNC パス（バックスラッシュ）', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-12 - true が返る', () => {
        it('T-LIB-U-12-12: \\\\server\\share は絶対パスと判定される', () => {
          assert(isAbsolutePath('\\\\server\\share'));
        });
      });
      describe('Then: T-LIB-U-12-13 - true が返る', () => {
        it('T-LIB-U-12-13: //server/share は絶対パスと判定される', () => {
          assert(isAbsolutePath('//server/share'));
        });
      });
    });
  });

  describe('Given: 拡張子付き相対ファイル名', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-14 - false が返る', () => {
        it('T-LIB-U-12-14: file.md は絶対パスではないと判定される', () => {
          assertFalse(isAbsolutePath('file.md'));
        });
      });
    });
  });

  describe('Given: URL pathname 形式の Windows パス（/C:/...）', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-15 - true が返る', () => {
        it('T-LIB-U-12-15: /C:/Users/foo は絶対パスと判定される（URL pathname 形式が正しく処理される）', () => {
          assert(isAbsolutePath('/C:/Users/foo'));
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// getBasename
// ─────────────────────────────────────────────

describe('getBasename', () => {
  describe('Given: Unix パス /foo/bar/baz.md', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-01 - baz が返る', () => {
        it('[Normal] T-LIB-U-15-01: Unix パスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('/foo/bar/baz.md'), 'baz');
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュパス C:\\Users\\foo\\file.txt', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-02 - file が返る', () => {
        it('[Normal] T-LIB-U-15-02: Windows バックスラッシュパスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('C:\\Users\\foo\\file.txt'), 'file');
        });
      });
    });
  });

  describe('Given: Windows スラッシュパス C:/Users/foo/file.txt', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-03 - file が返る', () => {
        it('[Normal] T-LIB-U-15-03: Windows スラッシュパスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('C:/Users/foo/file.txt'), 'file');
        });
      });
    });
  });

  describe('Given: セパレータなし file.md', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-04 - file が返る', () => {
        it('[Normal] T-LIB-U-15-04: セパレータなしパスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('file.md'), 'file');
        });
      });
    });
  });

  describe('Given: document.pdf', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-05 - document が返る', () => {
        it('[Normal] T-LIB-U-15-05: document.pdf から拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('document.pdf'), 'document');
        });
      });
    });
  });

  describe('Given: 複数拡張子 file.tar.gz', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-06 - file.tar が返る', () => {
        it('[Edge] T-LIB-U-15-06: 複数拡張子のパスから最後の拡張子のみ除去される', () => {
          assertEquals(getBasename('file.tar.gz'), 'file.tar');
        });
      });
    });
  });

  describe('Given: ドットファイル .hidden', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-07 - .hidden が返る', () => {
        it('[Edge] T-LIB-U-15-07: ドットファイルは拡張子なしと見なされてそのまま返る', () => {
          assertEquals(getBasename('.hidden'), '.hidden');
        });
      });
    });
  });

  describe('Given: フルパス内のドットファイル /path/to/.gitignore', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-08 - .gitignore が返る', () => {
        it('[Edge] T-LIB-U-15-08: フルパス内のドットファイルはそのまま返る', () => {
          assertEquals(getBasename('/path/to/.gitignore'), '.gitignore');
        });
      });
    });
  });

  describe('Given: 拡張子なし file', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-09 - file が返る', () => {
        it('[Edge] T-LIB-U-15-09: 拡張子なしファイル名はそのまま返る', () => {
          assertEquals(getBasename('file'), 'file');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-10 - 空文字列が返る', () => {
        it('[Edge] T-LIB-U-15-10: 空文字列から空文字列が返る', () => {
          assertEquals(getBasename(''), '');
        });
      });
    });
  });

  describe('Given: URL pathname 形式 /C:/Users/foo/file.txt', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-11 - file が返る', () => {
        it('[Edge] T-LIB-U-15-11: URL pathname 形式のパスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('/C:/Users/foo/file.txt'), 'file');
        });
      });
    });
  });

  describe('Given: 混在セパレータパス C:\\dir/sub\\file.md', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-12 - file が返る', () => {
        it('[Edge] T-LIB-U-15-12: 混在セパレータパスから拡張子なしファイル名が返る', () => {
          assertEquals(getBasename('C:\\dir/sub\\file.md'), 'file');
        });
      });
    });
  });

  describe('Given: 末尾スラッシュ付きパス /foo/bar/', () => {
    describe('When: getBasename を実行する', () => {
      describe('Then: T-LIB-U-15-13 - bar が返る', () => {
        it('[Edge] T-LIB-U-15-13: 末尾スラッシュ付きパスから正しいファイル名が返る', () => {
          assertEquals(getBasename('/foo/bar/'), 'bar');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// resolveConfigPath
// ─────────────────────────────────────────────

describe('resolveConfigPath', () => {
  beforeEach(() => resetProjectRoot('/home/user/project'));

  describe('Given: configPath に Unix 絶対パスを指定する', () => {
    describe('When: resolveConfigPath を実行する', () => {
      describe('Then: T-LIB-U-14-01 - 絶対パスが正規化されて返る', () => {
        it('T-LIB-U-14-01: Unix 絶対パスはそのまま正規化されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: '/home/user/config.yaml',
            }),
            '/home/user/config.yaml',
          );
        });
      });
    });
  });

  describe('Given: configPath に Windows バックスラッシュ絶対パスを指定する', () => {
    describe('When: resolveConfigPath を実行する', () => {
      describe('Then: T-LIB-U-14-02 - バックスラッシュがスラッシュに正規化されて返る', () => {
        it('T-LIB-U-14-02: Windows バックスラッシュ絶対パスはスラッシュに正規化されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'C:\\Users\\foo\\config.yaml',
            }),
            'C:/Users/foo/config.yaml',
          );
        });
      });
    });
  });

  describe('Given: configPath に相対パスを指定する', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-03 - プロジェクトルートと結合して正規化されて返る', () => {
        it('T-LIB-U-14-03: 相対パスはプロジェクトルートと結合されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'config/settings.yaml',
            }),
            '/home/user/project/config/settings.yaml',
          );
        });
      });
    });
  });

  describe('Given: configPath が未指定で defaultPath が絶対パス', () => {
    describe('When: resolveConfigPath を実行する', () => {
      describe('Then: T-LIB-U-14-04 - defaultPath が正規化されて返る', () => {
        it('T-LIB-U-14-04: configPath 省略のとき defaultPath 絶対パスが返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: '/home/user/project/default.yaml',
            }),
            '/home/user/project/default.yaml',
          );
        });
      });
    });
  });

  describe('Given: configPath が未指定で defaultPath が相対パス', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-05 - defaultPath がプロジェクトルートと結合されて返る', () => {
        it('T-LIB-U-14-05: configPath 省略のとき defaultPath 相対パスがルートと結合されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'config/default.yaml',
            }),
            '/home/user/project/config/default.yaml',
          );
        });
      });
    });
  });

  describe('Given: configPath が空文字列', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-07 - プロジェクトルートが末尾スラッシュなしで返る', () => {
        it('T-LIB-U-14-07: configPath="" のとき /home/user/project が返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: '',
            }),
            '/home/user/project',
          );
        });
      });
    });
  });

  describe('Given: configPath に相対ディレクトリパスを指定する', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-08 - プロジェクトルートと結合されて返る', () => {
        it('T-LIB-U-14-08: 相対ディレクトリパスはプロジェクトルートと結合されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'assets/dics',
            }),
            '/home/user/project/assets/dics',
          );
        });
      });
    });
  });

  describe('Given: configPath に Unix 絶対ディレクトリパスを指定する', () => {
    describe('When: resolveConfigPath を実行する', () => {
      describe('Then: T-LIB-U-14-09 - 絶対ディレクトリパスが正規化されて返る', () => {
        it('T-LIB-U-14-09: Unix 絶対ディレクトリパスはそのまま返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: '/home/user/data',
            }),
            '/home/user/data',
          );
        });
      });
    });
  });

  describe('Given: configPath に末尾スラッシュ付き相対ディレクトリパスを指定する', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-10 - 末尾スラッシュが除去されてプロジェクトルートと結合されて返る', () => {
        it('T-LIB-U-14-10: 末尾スラッシュ付き相対ディレクトリパスは末尾スラッシュが除去されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'assets/dics/',
            }),
            '/home/user/project/assets/dics',
          );
        });
      });
    });
  });

  describe('Given: configPath が未指定で defaultPath が相対ディレクトリパス', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-11 - defaultPath がプロジェクトルートと結合されて返る', () => {
        it('T-LIB-U-14-11: configPath 省略のとき defaultPath 相対ディレクトリがルートと結合されて返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'assets/dics',
            }),
            '/home/user/project/assets/dics',
          );
        });
      });
    });
  });

  describe('Given: configPath に絶対パスを指定し statProvider を渡さない', () => {
    /** `statProvider` なしでパス解決のみ行うことを検証する。 */
    describe('When: resolveConfigPath を実行する', () => {
      /** statProvider 不要でも正規化パスが返ることを確認する。 */
      describe('Then: T-LIB-U-14-16 - statProvider 未指定でも正規化パスが返る', () => {
        it('T-LIB-U-14-16: statProvider 未指定でも /home/user/config.yaml が返る', async () => {
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: '/home/user/config.yaml',
            }),
            '/home/user/config.yaml',
          );
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// joinPath
// ─────────────────────────────────────────────

describe('joinPath', () => {
  describe('Given: Unix ベースパス', () => {
    describe('When: joinPath を実行する', () => {
      describe('Then: T-LIB-U-20-01 - 正規化されたパスが返る', () => {
        it('[Normal] T-LIB-U-20-01: /foo + bar → /foo/bar', () => {
          assertEquals(joinPath('/foo', 'bar'), '/foo/bar');
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュのベースパス', () => {
    describe('When: joinPath を実行する', () => {
      describe('Then: T-LIB-U-20-02 - バックスラッシュがスラッシュに統一される', () => {
        it('[Normal] T-LIB-U-20-02: C:\\\\foo + bar → C:/foo/bar', () => {
          assertEquals(joinPath('C:\\foo', 'bar'), 'C:/foo/bar');
        });
      });
    });
  });

  describe('Given: 複数パーツのパス', () => {
    describe('When: joinPath を実行する', () => {
      describe('Then: T-LIB-U-20-03 - 全パーツが結合される', () => {
        it('[Normal] T-LIB-U-20-03: /a + b + c → /a/b/c', () => {
          assertEquals(joinPath('/a', 'b', 'c'), '/a/b/c');
        });
      });
    });
  });

  describe('Given: 末尾スラッシュ付きベースパス', () => {
    describe('When: joinPath を実行する', () => {
      describe('Then: T-LIB-U-20-04 - 末尾スラッシュが除去される', () => {
        it('[Edge] T-LIB-U-20-04: /foo/ + bar → /foo/bar', () => {
          assertEquals(joinPath('/foo/', 'bar'), '/foo/bar');
        });
      });
    });
  });

  describe('Given: パーツなし（base のみ）', () => {
    describe('When: joinPath を実行する', () => {
      describe('Then: T-LIB-U-20-05 - base がそのまま返る', () => {
        it('[Edge] T-LIB-U-20-05: joinPath("/foo") → /foo', () => {
          assertEquals(joinPath('/foo'), '/foo');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// getRelativePath
// ─────────────────────────────────────────────

describe('getRelativePath', () => {
  describe('Given: Unix パスで from の子パスへ', () => {
    describe('When: getRelativePath を実行する', () => {
      describe('Then: T-LIB-U-21-01 - 相対パスが返る', () => {
        it('[Normal] T-LIB-U-21-01: /a/b から /a/b/c/d.md → c/d.md', () => {
          assertEquals(getRelativePath('/a/b', '/a/b/c/d.md'), 'c/d.md');
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュパスで from の子パスへ', () => {
    describe('When: getRelativePath を実行する', () => {
      describe('Then: T-LIB-U-21-02 - バックスラッシュなしの相対パスが返る', () => {
        it('[Normal] T-LIB-U-21-02: C:\\\\foo から C:\\\\foo\\\\bar\\\\baz.md → bar/baz.md', () => {
          assertEquals(getRelativePath('C:\\foo', 'C:\\foo\\bar\\baz.md'), 'bar/baz.md');
        });
      });
    });
  });

  describe('Given: 同じパスを from と to に指定する', () => {
    describe('When: getRelativePath を実行する', () => {
      describe('Then: T-LIB-U-21-03 - 空文字列が返る', () => {
        it('[Edge] T-LIB-U-21-03: /a/b から /a/b → 空文字列', () => {
          assertEquals(getRelativePath('/a/b', '/a/b'), '');
        });
      });
    });
  });

  describe('Given: 上位ディレクトリへの相対パス（.. を含む）', () => {
    describe('When: getRelativePath を実行する', () => {
      /** `..` を含む相対パスが生成されるケース — normalizePath が throw する。 */
      describe('Then: T-LIB-U-21-04 - ChatlogError(InvalidPath) がスローされる', () => {
        it('[Error] T-LIB-U-21-04: /a/b/c から /a/b → .. を含む → ChatlogError', () => {
          assertThrows(() => getRelativePath('/a/b/c', '/a/b'), ChatlogError);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// toUnixPath
// ─────────────────────────────────────────────

// ─── Internal Helpers

// constants
/** 正常系テストケース（T-LIB-U-60）。 */
const _cases = [
  { id: 'T-LIB-U-60-01', input: 'a/b/../c', expected: 'a/c' },
  { id: 'T-LIB-U-60-02', input: 'a/./b', expected: 'a/b' },
  { id: 'T-LIB-U-60-03', input: '/foo/bar/../baz', expected: '/foo/baz' },
  { id: 'T-LIB-U-60-04', input: 'a/b/c/../../d', expected: 'a/d' },
  { id: 'T-LIB-U-60-05', input: 'C:\\a\\..\\b', expected: 'C:/b' },
] as const;

/** エッジケーステストケース（T-LIB-U-61）。 */
const _edgeCases = [
  { id: 'T-LIB-U-61-01', input: '', expected: '' },
  { id: 'T-LIB-U-61-02', input: '../../etc/passwd', expected: '../../etc/passwd' },
  { id: 'T-LIB-U-61-03', input: '/../x', expected: '/x' },
  { id: 'T-LIB-U-61-04', input: '/foo/bar/', expected: '/foo/bar' },
  { id: 'T-LIB-U-61-05', input: './foo', expected: 'foo' },
  { id: 'T-LIB-U-61-06', input: '.hidden', expected: '.hidden' },
  { id: 'T-LIB-U-61-07', input: 'file..name', expected: 'file..name' },
  { id: 'T-LIB-U-61-08', input: '/C:/Users/foo', expected: 'C:/Users/foo' },
  { id: 'T-LIB-U-61-09', input: 'c:/Users/foo', expected: 'C:/Users/foo' },
  { id: 'T-LIB-U-61-10', input: '/c:/Users/foo', expected: 'C:/Users/foo' },
] as const;

/**
 * `toUnixPath` のユニットテストスイート。
 *
 * バックスラッシュ変換・ドライブレター正規化・`..`/`./` 展開・末尾スラッシュ除去を検証する。
 *
 * テスト ID 範囲: T-LIB-U-60 〜 T-LIB-U-61
 *
 * @see toUnixPath
 */
describe('toUnixPath', () => {
  /** `..` / `./` / バックスラッシュを含む通常パスの変換テスト。 */
  describe('When: 正常系', () => {
    for (const { id, input, expected } of _cases) {
      it(`[Normal] ${id}: '${input}' → '${expected}'`, () => {
        assertEquals(toUnixPath(input), expected);
      });
    }
  });

  /** 空文字列・トラバーサル・ドライブレター・末尾スラッシュ等の特殊ケース。 */
  describe('When: エッジケース', () => {
    for (const { id, input, expected } of _edgeCases) {
      it(`[Edge] ${id}: '${input}' → '${expected}'`, () => {
        assertEquals(toUnixPath(input), expected);
      });
    }
  });
});

// ─────────────────────────────────────────────
// isSafePath
// ─────────────────────────────────────────────

// ─── Internal Helpers

// constants
/** TEMP と TMP の両方を固定する envProvider モック。 */
const _mockEnvTempTmp = (key: string): string | undefined => {
  const _env: Record<string, string> = { TEMP: '/tmp', TMP: '/tmp2' };
  return _env[key];
};

/** TEMP/TMP が未設定の envProvider モック。 */
const _mockEnvNoTemp = (_key: string): string | undefined => undefined;

/**
 * `isSafePath` のユニットテストスイート。
 *
 * projectRoot・TEMP・TMP・safeDirs による安全判定と、セグメント境界・相対パス解決を検証する。
 *
 * テスト ID 範囲: T-LIB-U-62-01 〜 T-LIB-U-62-10
 *
 * @see isSafePath
 */
describe('isSafePath', () => {
  beforeEach(() => resetProjectRoot('/home/user/project'));

  /** 安全なディレクトリ配下のパスは true を返す正常ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-U-62-01: projectRoot 自身のパス → true', async () => {
      assertEquals(await isSafePath('/home/user/project', { envProvider: _mockEnvTempTmp }), true);
    });
    it('[Normal] T-LIB-U-62-02: projectRoot 配下のパス → true', async () => {
      assertEquals(await isSafePath('/home/user/project/skills/foo.ts', { envProvider: _mockEnvTempTmp }), true);
    });
    it('[Normal] T-LIB-U-62-03: TEMP 配下のパス → true', async () => {
      assertEquals(await isSafePath('/tmp/work/output.md', { envProvider: _mockEnvTempTmp }), true);
    });
    it('[Normal] T-LIB-U-62-04: TMP 配下のパス → true', async () => {
      assertEquals(await isSafePath('/tmp2/work/output.md', { envProvider: _mockEnvTempTmp }), true);
    });
    it('[Normal] T-LIB-U-62-05: opts.safeDirs に指定したディレクトリの下 → true', async () => {
      assertEquals(
        await isSafePath('/custom/safe/file.ts', {
          envProvider: _mockEnvNoTemp,
          safeDirs: ['/custom/safe'],
        }),
        true,
      );
    });
    it('[Normal] T-LIB-U-62-06: projectRoot 外のパス → false', async () => {
      assertEquals(await isSafePath('/var/log/system.log', { envProvider: _mockEnvTempTmp }), false);
    });
  });

  /** セグメント境界・相対パス・空 safeDirs・TEMP/TMP 未設定の特殊ケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-U-62-07: /project-evil はセグメント境界で false', async () => {
      assertEquals(await isSafePath('/home/user/project-evil/file.ts', { envProvider: _mockEnvTempTmp }), false);
    });
    it('[Edge] T-LIB-U-62-08: 相対パスが projectRoot 配下に解決される → true', async () => {
      assertEquals(await isSafePath('skills/foo.ts', { envProvider: _mockEnvTempTmp }), true);
    });
    it('[Edge] T-LIB-U-62-09: opts.safeDirs が空配列 → projectRoot/TEMP/TMP のみで判定（projectRoot 配下は true）', async () => {
      assertEquals(
        await isSafePath('/home/user/project/file.ts', {
          envProvider: _mockEnvTempTmp,
          safeDirs: [],
        }),
        true,
      );
    });
    it('[Edge] T-LIB-U-62-10: TEMP/TMP が未設定のとき /tmp/x は false', async () => {
      assertEquals(await isSafePath('/tmp/x', { envProvider: _mockEnvNoTemp }), false);
    });
  });
});
