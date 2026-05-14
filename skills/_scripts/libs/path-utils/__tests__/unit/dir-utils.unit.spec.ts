// src: skills/_scripts/libs/path-utils/__tests__/unit/dir-utils.unit.spec.ts
// @(#): dir-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test helpers --
import {
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../__tests__/helpers/deno-command-mock.ts';

// -- test target --
import { getProjectRootDir, homeDir } from '../../dir-utils.ts';

// -- error class --
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// homeDir
// ─────────────────────────────────────────────

describe('homeDir', () => {
  describe('Given: HOME 環境変数が設定されている', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-U-06-01 - HOME の値が返る', () => {
        it('T-LIB-U-06-01: HOME が設定されている場合はその値を返す', () => {
          const _env = (name: string): string | undefined => {
            if (name === 'HOME') { return '/home/testuser'; }
            return undefined;
          };
          assertEquals(homeDir(_env), '/home/testuser');
        });
      });
    });
  });

  describe('Given: HOME 未設定・USERPROFILE が設定されている', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-U-06-02 - USERPROFILE の値が返る', () => {
        it('T-LIB-U-06-02: HOME 未設定で USERPROFILE が設定されている場合はその値を返す', () => {
          const _env = (name: string): string | undefined => {
            if (name === 'USERPROFILE') { return 'C:/Users/testuser'; }
            return undefined;
          };
          assertEquals(homeDir(_env), 'C:/Users/testuser');
        });
      });
    });
  });

  describe('Given: HOME・USERPROFILE ともに未設定', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-U-06-03 - "~" が返る', () => {
        it('T-LIB-U-06-03: どちらも未設定の場合は "~" を返す', () => {
          const _env = (_name: string): string | undefined => undefined;
          assertEquals(homeDir(_env), '~');
        });
      });
    });
  });

  describe('Given: HOME 未設定・USERPROFILE がバックスラッシュパス', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-U-06-04 - バックスラッシュがスラッシュに正規化される', () => {
        it('T-LIB-U-06-04: USERPROFILE が Windows バックスラッシュパスの場合はスラッシュに変換して返す', () => {
          const _env = (name: string): string | undefined => {
            if (name === 'USERPROFILE') { return 'C:\\Users\\testuser'; }
            return undefined;
          };
          assertEquals(homeDir(_env), 'C:/Users/testuser');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// getProjectRootDir
// ─────────────────────────────────────────────

describe('Given: Git リポジトリ内でプロジェクトルートを取得する', () => {
  describe('When: git rev-parse --show-toplevel が成功する', () => {
    describe('Then: T-LIB-U-13-01 - Unix パスで正常取得', () => {
      it('T-LIB-U-13-01: stdout "/home/user/project\\n" → "/home/user/project" が返る', async () => {
        const _mock = makeSuccessMock(new TextEncoder().encode('/home/user/project\n'));
        const _result = await getProjectRootDir(_mock);
        assertEquals(_result, '/home/user/project');
      });
    });

    describe('Then: T-LIB-U-13-02 - Windows バックスラッシュ正規化', () => {
      it('T-LIB-U-13-02: stdout "C:\\\\Users\\\\foo\\\\project\\r\\n" → "C:/Users/foo/project" が返る', async () => {
        const _mock = makeSuccessMock(new TextEncoder().encode('C:\\Users\\foo\\project\r\n'));
        const _result = await getProjectRootDir(_mock);
        assertEquals(_result, 'C:/Users/foo/project');
      });
    });
  });
});

describe('Given: git が未インストールの環境でプロジェクトルートを取得しようとする', () => {
  describe('When: Deno.Command の output() が Deno.errors.NotFound をスローする', () => {
    describe('Then: T-LIB-U-13-03 - ChatlogError(GitNotFound) が throw される', () => {
      it('T-LIB-U-13-03: makeNotFoundMock() → ChatlogError(GitNotFound) が reject される', async () => {
        const _mock = makeNotFoundMock();
        const _err = await assertRejects(
          () => getProjectRootDir(_mock),
          ChatlogError,
          'Git Not Found',
        ) as ChatlogError;
        assertEquals(_err.subindex, 'GitCmd');
      });
    });
  });
});

describe('Given: Git リポジトリ外でプロジェクトルートを取得しようとする', () => {
  describe('When: git rev-parse --show-toplevel が exit 128 で失敗する', () => {
    describe('Then: T-LIB-U-13-04 - ChatlogError(NotInGitRepo) が throw される', () => {
      it('T-LIB-U-13-04: makeFailMock(128) → ChatlogError(NotInGitRepo) が reject される', async () => {
        const _mock = makeFailMock(128);
        const _err = await assertRejects(
          () => getProjectRootDir(_mock),
          ChatlogError,
          'Not In Git Repository',
        ) as ChatlogError;
        assertEquals(_err.subindex, 'GitCmd');
      });
    });
  });
});
