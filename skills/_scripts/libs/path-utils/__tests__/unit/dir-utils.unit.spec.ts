// src: skills/_scripts/libs/path-utils/__tests__/unit/dir-utils.unit.spec.ts
// @(#): dir-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { getProjectRoot, homeDir, resetProjectRoot } from '../../dir-utils.ts';

// ─── Tests

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
// getProjectRoot / resetProjectRoot
// ─────────────────────────────────────────────

/**
 * `getProjectRoot` / `resetProjectRoot` のユニットテストスイート。
 *
 * シード設定・キャッシュ動作・リセット・バックスラッシュ正規化を検証する。
 *
 * テスト ID 範囲: T-LIB-U-60 〜 T-LIB-U-62
 *
 * @see getProjectRoot
 * @see resetProjectRoot
 */
describe('getProjectRoot / resetProjectRoot', () => {
  beforeEach(() => resetProjectRoot());

  /** seed 設定後に getProjectRoot() が git を実行せず即時返るテスト。 */
  describe('When: resetProjectRoot でパスをシードした場合', () => {
    it('[Normal] T-LIB-U-60-01: resetProjectRoot("/home/user/project") 後に getProjectRoot() → "/home/user/project" が返る', async () => {
      resetProjectRoot('/home/user/project');
      const _result = await getProjectRoot();
      assertEquals(_result, '/home/user/project');
    });

    it('[Normal] T-LIB-U-60-02: getProjectRoot() を 2 回呼ぶ → キャッシュが機能し両方同じ値を返す', async () => {
      resetProjectRoot('/home/user/project');
      const _result1 = await getProjectRoot();
      const _result2 = await getProjectRoot();
      assertEquals(_result1, '/home/user/project');
      assertEquals(_result2, '/home/user/project');
    });

    it('[Edge] T-LIB-U-60-03: resetProjectRoot("/proj1") → getProjectRoot() → resetProjectRoot("/proj2") → getProjectRoot() → それぞれ正しい値を返す', async () => {
      resetProjectRoot('/proj1');
      const _result1 = await getProjectRoot();
      resetProjectRoot('/proj2');
      const _result2 = await getProjectRoot();
      assertEquals(_result1, '/proj1');
      assertEquals(_result2, '/proj2');
    });
  });

  /** 引数なし/空文字でキャッシュがクリアされることを確認するテスト。 */
  describe('When: resetProjectRoot を引数なし/空文字で呼んだ場合', () => {
    it('[Normal] T-LIB-U-61-01: resetProjectRoot() 後に再シードすると新しい値が返る', async () => {
      resetProjectRoot('/home/user/project');
      resetProjectRoot();
      resetProjectRoot('/new/path');
      const _result = await getProjectRoot();
      assertEquals(_result, '/new/path');
    });

    it('[Edge] T-LIB-U-61-02: resetProjectRoot("") 後に再シードすると新しい値が返る', async () => {
      resetProjectRoot('/home/user/project');
      resetProjectRoot('');
      resetProjectRoot('/another/path');
      const _result = await getProjectRoot();
      assertEquals(_result, '/another/path');
    });
  });

  /** バックスラッシュパスが正規化されることを確認するテスト。 */
  describe('When: バックスラッシュパスをシードする場合', () => {
    it('[Edge] T-LIB-U-62-01: resetProjectRoot("C:\\\\Users\\\\foo") → getProjectRoot() → "C:/Users/foo" が返る', async () => {
      resetProjectRoot('C:\\Users\\foo');
      const _result = await getProjectRoot();
      assertEquals(_result, 'C:/Users/foo');
    });
  });
});
