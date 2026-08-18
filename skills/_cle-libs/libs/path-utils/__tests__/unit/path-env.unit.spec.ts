// src: skills/_cle-libs/libs/path-utils/__tests__/unit/path-env.unit.spec.ts
// @(#): expandEnvVars / homeDir のユニットテスト
//       対象: expandEnvVars, homeDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { expandEnvVars, homeDir } from '../../path-env.ts';

// ─── Helpers
import { resetProjectRoot } from '../../dir-utils.ts';
// helpers
import { assertThrowsChatlogError } from '../../../../__tests__/helpers/assert.ts';

// ─── Internal Helpers

// functions
/** envProvider モックを生成する。map に存在しないキーは undefined を返す。 */
const _mockEnv = (map: Record<string, string | undefined>) => (key: string): string | undefined => map[key];

// ─── Tests

/**
 * `homeDir` のユニットテストスイート。
 *
 * HOME / USERPROFILE 環境変数からホームディレクトリパスを取得する動作を検証する。
 *
 * テスト ID 範囲: T-LIB-PE-06
 *
 * @see homeDir
 */
describe('homeDir', () => {
  describe('Given: HOME 環境変数が設定されている', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-PE-06-01 - HOME の値が返る', () => {
        it('T-LIB-PE-06-01: HOME が設定されている場合はその値を返す', () => {
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
      describe('Then: T-LIB-PE-06-02 - USERPROFILE の値が返る', () => {
        it('T-LIB-PE-06-02: HOME 未設定で USERPROFILE が設定されている場合はその値を返す', () => {
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
      describe('Then: T-LIB-PE-06-03 - "~" が返る', () => {
        it('T-LIB-PE-06-03: どちらも未設定の場合は "~" を返す', () => {
          const _env = (_name: string): string | undefined => undefined;
          assertEquals(homeDir(_env), '~');
        });
      });
    });
  });

  describe('Given: HOME 未設定・USERPROFILE がバックスラッシュパス', () => {
    describe('When: homeDir を実行する', () => {
      describe('Then: T-LIB-PE-06-04 - バックスラッシュがスラッシュに正規化される', () => {
        it('T-LIB-PE-06-04: USERPROFILE が Windows バックスラッシュパスの場合はスラッシュに変換して返す', () => {
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

/**
 * `expandEnvVars` のユニットテストスイート。
 *
 * 組み込み allowList (TEMP/TMP) / 特殊キーワード / エラー系を検証する。
 * allowList はハードコードされた ['TEMP', 'TMP'] のみ。
 *
 * テスト ID 範囲: T-LIB-PE-70 〜 T-LIB-PE-79
 *
 * @see expandEnvVars
 */
describe('expandEnvVars', () => {
  /**
   * 組み込み allowList (TEMP/TMP) 変数の展開テスト。
   */
  describe('allowList 変数の展開 (TEMP/TMP)', () => {
    /** TEMP, TMP が展開される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-PE-70-01: ${TEMP}/logs + TEMP=/tmp → /tmp/logs', () => {
        const _result = expandEnvVars('${TEMP}/logs', _mockEnv({ TEMP: '/tmp' }));
        assertEquals(_result, '/tmp/logs');
      });

      it('[Normal] T-LIB-PE-70-02: ${TMP}/cache + TMP=/var/tmp → /var/tmp/cache', () => {
        const _result = expandEnvVars('${TMP}/cache', _mockEnv({ TMP: '/var/tmp' }));
        assertEquals(_result, '/var/tmp/cache');
      });

      it('[Normal] T-LIB-PE-70-03: ${TEMP}/${TEMP} (重複) + TEMP=/tmp → /tmp//tmp', () => {
        const _result = expandEnvVars('${TEMP}/${TEMP}', _mockEnv({ TEMP: '/tmp' }));
        assertEquals(_result, '/tmp//tmp');
      });

      it('[Normal] T-LIB-PE-70-04: /base/${TMP}/file.txt + TMP=t → /base/t/file.txt', () => {
        const _result = expandEnvVars('/base/${TMP}/file.txt', _mockEnv({ TMP: 't' }));
        assertEquals(_result, '/base/t/file.txt');
      });
    });
  });

  /**
   * ${ProjectRoot} 特殊キーワードの展開テスト。
   */
  describe('${ProjectRoot} 特殊キーワード', () => {
    beforeEach(() => resetProjectRoot('/mock/project'));
    afterEach(() => resetProjectRoot());

    /** ProjectRoot は allowList 不要で展開される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-PE-71-01: ${ProjectRoot}/src → /mock/project/src', () => {
        const _result = expandEnvVars('${ProjectRoot}/src');
        assertEquals(_result, '/mock/project/src');
      });

      it('[Normal] T-LIB-PE-71-02: ${ProjectRoot}/a/b/c → /mock/project/a/b/c', () => {
        const _result = expandEnvVars('${ProjectRoot}/a/b/c');
        assertEquals(_result, '/mock/project/a/b/c');
      });

      it('[Normal] T-LIB-PE-71-03: ${ProjectRoot} のみ → /mock/project', () => {
        const _result = expandEnvVars('${ProjectRoot}');
        assertEquals(_result, '/mock/project');
      });
    });
  });

  /**
   * ${HOME} 特殊キーワードの展開テスト。
   */
  describe('${HOME} 特殊キーワード', () => {
    /** HOME は allowList 不要で展開される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-LIB-PE-72-01: ${HOME}/notes + HOME=/mock/home → /mock/home/notes', () => {
        const _result = expandEnvVars(
          '${HOME}/notes',
          _mockEnv({ HOME: '/mock/home', USERPROFILE: undefined }),
        );
        assertEquals(_result, '/mock/home/notes');
      });

      it('[Normal] T-LIB-PE-72-02: ${HOME} のみ + HOME=/mock/home → /mock/home', () => {
        const _result = expandEnvVars(
          '${HOME}',
          _mockEnv({ HOME: '/mock/home', USERPROFILE: undefined }),
        );
        assertEquals(_result, '/mock/home');
      });
    });
  });

  /**
   * プレースホルダーなし・空文字・`$VAR` 形式のエッジケース。
   */
  describe('プレースホルダーなし / エッジケース', () => {
    /** マッチなし・空文字・非対応形式は入力をそのまま返す。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-PE-73-01: $TEMP (ブレースなし) → そのまま返す', () => {
        const _result = expandEnvVars('$TEMP', _mockEnv({ TEMP: '/tmp' }));
        assertEquals(_result, '$TEMP');
      });

      it('[Edge] T-LIB-PE-73-02: 空文字列 → 空文字列', () => {
        const _result = expandEnvVars('');
        assertEquals(_result, '');
      });

      it('[Edge] T-LIB-PE-73-03: プレースホルダーなしのパス → そのまま返す', () => {
        const _result = expandEnvVars('/no/placeholder');
        assertEquals(_result, '/no/placeholder');
      });
    });
  });

  /**
   * allowList 外変数（TEMP/TMP/ProjectRoot/HOME 以外）のエラーテスト。
   */
  describe('allowList 外変数', () => {
    /** allowList に含まれない変数は EnvVarNotAllowed をスローする。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-PE-74-01: ${SECRET} → ChatlogError(EnvVarNotAllowed)', () => {
        assertThrowsChatlogError(
          () => expandEnvVars('${SECRET}', _mockEnv({ SECRET: 's3cr3t' })),
          'EnvVarNotAllowed',
        );
      });
    });
  });

  /**
   * 未定義変数のエラーテスト。
   */
  describe('未定義変数', () => {
    /** allowList に含まれるが未設定の変数は EnvVarNotSet をスローする。 */
    describe('When: 異常系', () => {
      it('[Error] T-LIB-PE-75-01: ${TEMP} + TEMP=undefined → ChatlogError(EnvVarNotSet)', () => {
        assertThrowsChatlogError(
          () => expandEnvVars('${TEMP}', _mockEnv({ TEMP: undefined })),
          'EnvVarNotSet',
        );
      });
    });
  });

  /**
   * 大文字小文字区別・再展開なし・連続プレースホルダー・カスタム env のエッジケース。
   */
  describe('その他エッジケース', () => {
    describe('When: エッジケース', () => {
      it('[Edge] T-LIB-PE-76-01: ${PROJECTROOT} (大文字) → ChatlogError(EnvVarNotAllowed)', () => {
        assertThrowsChatlogError(
          () => expandEnvVars('${PROJECTROOT}'),
          'EnvVarNotAllowed',
        );
      });

      it("[Edge] T-LIB-PE-77-01: ${TEMP}='${TMP}' → 再展開しない (${TMP} のまま)", () => {
        const _result = expandEnvVars('${TEMP}', _mockEnv({ TEMP: '${TMP}', TMP: 'leaked' }));
        assertEquals(_result, '${TMP}');
      });

      it('[Edge] T-LIB-PE-78-01: ${TEMP}${TMP} 連続 + TEMP=/tmp, TMP=/var → /tmp/var', () => {
        const _result = expandEnvVars('${TEMP}${TMP}', _mockEnv({ TEMP: '/tmp', TMP: '/var' }));
        assertEquals(_result, '/tmp/var');
      });

      it('[Edge] T-LIB-PE-79-01: ${TEMP} + カスタム env → custom-value', () => {
        const _result = expandEnvVars('${TEMP}', _mockEnv({ TEMP: 'custom-value' }));
        assertEquals(_result, 'custom-value');
      });
    });
  });
});
