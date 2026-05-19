// src: skills/_scripts/libs/path-utils/__tests__/unit/path-utils.unit.spec.ts
// @(#): path-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import {
  getDirectory,
  getFilename,
  isAbsolutePath,
  normalizePath,
  resolveConfigPath,
} from '../../path-utils.ts';

// -- test helpers --
import {
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../__tests__/helpers/deno-command-mock.ts';
// providers for
import type { CommandProvider } from '../../../../types/providers.types.ts';
// error class
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

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
          assertEquals(isAbsolutePath('/home/user'), true);
        });
      });
      describe('Then: T-LIB-U-12-02 - true が返る', () => {
        it('T-LIB-U-12-02: /etc/config は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('/etc/config'), true);
        });
      });
      describe('Then: T-LIB-U-12-03 - true が返る', () => {
        it('T-LIB-U-12-03: / は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('/'), true);
        });
      });
    });
  });

  describe('Given: 相対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-04 - false が返る', () => {
        it('T-LIB-U-12-04: relative/path は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath('relative/path'), false);
        });
      });
      describe('Then: T-LIB-U-12-05 - false が返る', () => {
        it('T-LIB-U-12-05: ./relative は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath('./relative'), false);
        });
      });
      describe('Then: T-LIB-U-12-06 - false が返る', () => {
        it('T-LIB-U-12-06: ../parent は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath('../parent'), false);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-07 - false が返る', () => {
        it('T-LIB-U-12-07: 空文字列は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath(''), false);
        });
      });
    });
  });

  describe('Given: Windows バックスラッシュ絶対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-08 - true が返る', () => {
        it('T-LIB-U-12-08: C:\\Users\\foo は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('C:\\Users\\foo'), true);
        });
      });
      describe('Then: T-LIB-U-12-09 - true が返る', () => {
        it('T-LIB-U-12-09: D:/data は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('D:/data'), true);
        });
      });
      describe('Then: T-LIB-U-12-10 - true が返る', () => {
        it('T-LIB-U-12-10: c:/path は絶対パスと判定される（小文字ドライブレター）', () => {
          assertEquals(isAbsolutePath('c:/path'), true);
        });
      });
    });
  });

  describe('Given: Windows ドライブレター付き相対パス', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-11 - false が返る', () => {
        it('T-LIB-U-12-11: C:foo は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath('C:foo'), false);
        });
      });
    });
  });

  describe('Given: UNC パス（バックスラッシュ）', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-12 - true が返る', () => {
        it('T-LIB-U-12-12: \\\\server\\share は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('\\\\server\\share'), true);
        });
      });
      describe('Then: T-LIB-U-12-13 - true が返る', () => {
        it('T-LIB-U-12-13: //server/share は絶対パスと判定される', () => {
          assertEquals(isAbsolutePath('//server/share'), true);
        });
      });
    });
  });

  describe('Given: 拡張子付き相対ファイル名', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-14 - false が返る', () => {
        it('T-LIB-U-12-14: file.md は絶対パスではないと判定される', () => {
          assertEquals(isAbsolutePath('file.md'), false);
        });
      });
    });
  });

  describe('Given: URL pathname 形式の Windows パス（/C:/...）', () => {
    describe('When: isAbsolutePath を実行する', () => {
      describe('Then: T-LIB-U-12-15 - true が返る', () => {
        it('T-LIB-U-12-15: /C:/Users/foo は絶対パスと判定される（URL pathname 形式が正しく処理される）', () => {
          assertEquals(isAbsolutePath('/C:/Users/foo'), true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// resolveConfigPath
// ─────────────────────────────────────────────

describe('resolveConfigPath', () => {
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
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'config/settings.yaml',
              commandProvider: _mock as unknown as CommandProvider,
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
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'config/default.yaml',
              commandProvider: _mock as unknown as CommandProvider,
            }),
            '/home/user/project/config/default.yaml',
          );
        });
      });
    });
  });

  describe('Given: 相対パスで git コマンドが見つからない', () => {
    describe('When: resolveConfigPath を実行する（makeNotFoundMock）', () => {
      describe('Then: T-LIB-U-14-06 - ChatlogError(GitNotFound) で reject する', () => {
        it('T-LIB-U-14-06: makeNotFoundMock() → ChatlogError(GitNotFound) で reject される', async () => {
          await assertRejects(
            () =>
              resolveConfigPath({
                defaultPath: 'default.yaml',
                configPath: 'config/settings.yaml',
                commandProvider: makeNotFoundMock() as unknown as CommandProvider,
              }),
            ChatlogError,
          );
        });
      });
    });
  });

  describe('Given: configPath が空文字列', () => {
    describe('When: resolveConfigPath を実行する（root=/home/user/project）', () => {
      describe('Then: T-LIB-U-14-07 - プロジェクトルートが末尾スラッシュなしで返る', () => {
        it('T-LIB-U-14-07: configPath="" のとき /home/user/project が返る', async () => {
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: '',
              commandProvider: _mock as unknown as CommandProvider,
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
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'assets/dics',
              commandProvider: _mock as unknown as CommandProvider,
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
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'default.yaml',
              configPath: 'assets/dics/',
              commandProvider: _mock as unknown as CommandProvider,
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
          const _enc = new TextEncoder();
          const _mock = makeSuccessMock(_enc.encode('/home/user/project\n'));
          assertEquals(
            await resolveConfigPath({
              defaultPath: 'assets/dics',
              commandProvider: _mock as unknown as CommandProvider,
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
