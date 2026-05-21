// src: skills/_scripts/classes/__tests__/unit/GlobalConfig.unit.spec.ts
// @(#): GlobalConfig シングルトン ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertFalse, assertRejects, assertStrictEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
// types
import type { ReadTextFileProvider } from '../../../types/providers.types.ts';
// constants
import { DEFAULT_CONFIG_FILE } from '../../../constants/defaults.constants.ts';
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─── Internal Helpers

// types

/** テストケース: 正常系 */
type NormalCase = {
  id: string;
  label: string;
  input: Record<string, unknown>;
  expected: Record<string, string | number>;
};

/** テストケース: 異常系 */
// deno-lint-ignore no-explicit-any
type ErrorCase = { id: string; label: string; input: Record<string, unknown>; errorType: new(...args: any[]) => Error };

/** テストケース: エッジケース */
type EdgeCase = {
  id: string;
  label: string;
  input: Record<string, unknown>;
  expected: Record<string, string | number>;
};

// functions

/** ファイル読み込みを成功させる `ReadTextFileProvider` スタブ。指定内容を返す。 */
const _makeReadOk = (content: string): ReadTextFileProvider => (_path: string) => Promise.resolve(content);

/** ファイル未存在を模倣する `ReadTextFileProvider`。`Deno.errors.NotFound` を reject する。 */
const _notFoundRead: ReadTextFileProvider = () => Promise.reject(new Deno.errors.NotFound('no such file'));

// ─── Tests

/**
 * `GlobalConfig` クラスのユニットテストスイート。
 *
 * シングルトン取得・値参照・YAML パース・ファイル読み込みを検証する。
 *
 * テスト ID 範囲: T-CLS-GC-01 〜 T-CLS-GC-72
 *
 * @see GlobalConfig
 */
describe('GlobalConfig', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── getInstance ──────────────────────────────────────────────────────────

  /**
   * `getInstance` のシングルトン動作テスト。
   *
   * 初回取得（引数なし・configFile・yaml）・既存インスタンスへの後続呼び出しを検証する。
   */
  describe('getInstance', () => {
    /** 引数なし・有効な configFile・有効な yaml を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-GC-01: 2 回の getInstance は同一参照を返す', async () => {
        const _a = await GlobalConfig.getInstance();
        const _b = await GlobalConfig.getInstance();
        assertStrictEquals(_a, _b);
      });

      it('[Normal] T-CLS-GC-02: 異なる変数から取得しても同じ状態を持つ', async () => {
        const _first = await GlobalConfig.getInstance();
        const _second = await GlobalConfig.getInstance();
        assertEquals(_first.get('agent'), _second.get('agent'));
      });

      it('[Normal] T-CLS-GC-40: 引数なしで呼ぶと get("agent") が DEFAULT_VALUES の値を返す', async () => {
        const _config = await GlobalConfig.getInstance();
        assertEquals(_config.get('agent'), 'claude');
        assertEquals(_config.get('chatlogsDir'), './chatlogs');
      });

      it('[Normal] T-CLS-GC-41: configFile 指定+存在+valid YAML → get("agent") が YAML 値を返す', async () => {
        const _config = await GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
      });

      it('[Normal] T-CLS-GC-61: yaml で chatlogsDir が設定される', async () => {
        const _config = await GlobalConfig.getInstance({ yaml: 'chatlogsDir: /tmp/test-chatlogs\n' });
        assertEquals(_config.get('chatlogsDir'), '/tmp/test-chatlogs');
      });

      it('[Normal] T-CLS-GC-62: yaml と configFile が両方指定されたとき yaml が優先され readTextFileProvider は呼ばれない', async () => {
        const _called = { flag: false };
        const _trackingRead: ReadTextFileProvider = (_path: string) => {
          _called.flag = true;
          return Promise.resolve('agent: chatgpt\n');
        };
        const _config = await GlobalConfig.getInstance({
          yaml: 'chatlogsDir: /tmp/yaml-wins\n',
          configFile: '/mock/config.yaml',
          readTextFileProvider: _trackingRead,
        });
        assertEquals(_config.get('chatlogsDir'), '/tmp/yaml-wins');
        assertFalse(_called.flag);
      });

      it('[Normal] T-CLS-GC-67: デフォルト値の全フィールドを get() で確認する', async () => {
        const _config = await GlobalConfig.getInstance();
        assertEquals(_config.get('agent'), 'claude');
        assertEquals(_config.get('chatlogsDir'), './chatlogs');
        assertEquals(_config.get('model'), 'sonnet');
        assertEquals(_config.get('timeoutMs'), 120000);
        assertEquals(_config.get('chunkSize'), 10);
        assertEquals(_config.get('concurrency'), 4);
      });

      it('[Normal] T-CLS-GC-68: yaml で複数フィールドを指定すると get() で反映が確認できる', async () => {
        const _config = await GlobalConfig.getInstance({ yaml: 'agent: chatgpt\nchatlogsDir: /tmp/logs\n' });
        assertEquals(_config.get('agent'), 'chatgpt');
        assertEquals(_config.get('chatlogsDir'), '/tmp/logs');
      });

      it('[Normal] T-CLS-GC-69: configFile 経由でフィールドが反映され get() で確認できる', async () => {
        const _config = await GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\ntimeoutMs: 30000\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
        assertEquals(_config.get('timeoutMs'), 30000);
      });

      it('[Normal] T-CLS-GC-70: yaml と configFile 両方指定時、yaml の agent が get() で反映される', async () => {
        const _config = await GlobalConfig.getInstance({
          yaml: 'agent: chatgpt\n',
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: claude\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
      });
    });

    /** 不正な YAML でエラーがスローされるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-GC-43: configFile 指定+不正 YAML → ChatlogError(InvalidYaml) で reject', async () => {
        const _err = await assertRejects(
          () =>
            GlobalConfig.getInstance({
              configFile: '/mock/config.yaml',
              readTextFileProvider: _makeReadOk('key: [unclosed'),
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
      });

      it('[Error] T-CLS-GC-64: yaml が不正 YAML 構文のとき ChatlogError(InvalidYaml) で reject される', async () => {
        const _err = await assertRejects(
          () => GlobalConfig.getInstance({ yaml: 'key: [unclosed' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
      });

      it('[Error] T-CLS-GC-71: yaml に未知キーがあると ChatlogError(InvalidYaml/UnknownKey) で reject される', async () => {
        const _err = await assertRejects(
          () => GlobalConfig.getInstance({ yaml: 'unknownKey: value\n' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'UnknownKey');
      });

      it('[Error] T-CLS-GC-72: yaml のルートがスカラー値のとき ChatlogError(InvalidYaml/NotObject) で reject される', async () => {
        const _err = await assertRejects(
          () => GlobalConfig.getInstance({ yaml: 'just-a-string\n' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'NotObject');
      });
    });

    /** 境界値・副作用・優先度など特殊なケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-GC-42: configFile 指定+存在しない → エラーなし、get("agent") が DEFAULT_VALUES の値を返す', async () => {
        const _config = await GlobalConfig.getInstance({
          configFile: '/mock/missing.yaml',
          readTextFileProvider: _notFoundRead,
        });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-44: getInstance() の戻り値と再取得が同一参照', async () => {
        const _created = await GlobalConfig.getInstance();
        const _got = await GlobalConfig.getInstance();
        assertStrictEquals(_created, _got);
      });

      it('[Edge] T-CLS-GC-63: yaml が空文字列のときデフォルト値が使われる', async () => {
        const _config = await GlobalConfig.getInstance({ yaml: '' });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-65: 既存インスタンスがある場合 yaml オプションは無視される', async () => {
        const _first = await GlobalConfig.getInstance();
        assertEquals(_first.get('agent'), 'claude');
        const _second = await GlobalConfig.getInstance({ yaml: 'agent: chatgpt\n' });
        assertStrictEquals(_first, _second);
        assertEquals(_second.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-66: 既存インスタンスがある場合 configFile オプションは無視される', async () => {
        const _first = await GlobalConfig.getInstance();
        const _second = await GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertStrictEquals(_first, _second);
        assertEquals(_second.get('agent'), 'claude');
      });
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  /**
   * `get` の値参照テスト。
   *
   * スキーマ登録済みキーの値取得・未登録キーの undefined 返却を検証する。
   */
  describe('get', () => {
    it('[Normal] T-CLS-GC-03: 設定済みキーの値を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.get('model'), 'sonnet');
    });
  });

  // ─── parseYaml ───────────────────────────────────────────────────────────

  /**
   * `parseYaml` のスキーマ検証・型変換テスト。
   *
   * string/number フィールドの変換・未知キーのエラー・null/undefined 境界値を検証する。
   */
  describe('parseYaml', () => {
    // constants

    /** 正常系テストケーステーブル。 */
    const _happyCases: NormalCase[] = [
      {
        id: 'T-CLS-GC-10',
        label: 'string フィールドはそのまま返す',
        input: { agent: 'claude' },
        expected: { agent: 'claude' },
      },
      {
        id: 'T-CLS-GC-11',
        label: 'number フィールドの数値型はそのまま返す',
        input: { timeoutMs: 120000 },
        expected: { timeoutMs: 120000 },
      },
      {
        id: 'T-CLS-GC-12',
        label: 'number フィールドの数値文字列は数値に変換',
        input: { timeoutMs: '120_000' },
        expected: { timeoutMs: 120000 },
      },
      {
        id: 'T-CLS-GC-13',
        label: '複数フィールドを正しく変換して返す',
        input: { agent: 'claude', timeoutMs: 30000 },
        expected: { agent: 'claude', timeoutMs: 30000 },
      },
      { id: 'T-CLS-GC-14', label: '空オブジェクトは空オブジェクトを返す', input: {}, expected: {} },
    ];

    /** エッジケーステストケーステーブル。 */
    const _edgeCases: EdgeCase[] = [
      { id: 'T-CLS-GC-15', label: 'undefined 値のキーは結果に含まれない', input: { agent: undefined }, expected: {} },
      {
        id: 'T-CLS-GC-16',
        label: "string フィールドの null は '' に変換される",
        input: { agent: null },
        expected: { agent: '' },
      },
      { id: 'T-CLS-GC-17', label: 'number フィールドの null は省略される', input: { timeoutMs: null }, expected: {} },
    ];

    /** 異常系テストケーステーブル。 */
    const _errorCases: ErrorCase[] = [
      {
        id: 'T-CLS-GC-18',
        label: '未知キーは ChatlogError をスローする',
        input: { unknownKey: 'value' },
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-19',
        label: 'string フィールドに number 型は TypeError をスローする',
        input: { agent: 42 },
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-20',
        label: 'number フィールドに非数値文字列は TypeError をスローする',
        input: { timeoutMs: 'abc' },
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-21',
        label: 'number フィールドに boolean は TypeError をスローする',
        input: { timeoutMs: true },
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-22',
        label: '不明キーが混在しても ChatlogError をスローする',
        input: { agent: 'claude', badKey: 'x' },
        errorType: ChatlogError,
      },
    ];

    /** string/number フィールドが正しく変換されるケース。 */
    describe('When: 正常系', () => {
      for (const tc of _happyCases) {
        it(`[Normal] ${tc.id}: ${tc.label}`, async () => {
          const _config = await GlobalConfig.getInstance();
          assertEquals(_config.parseYaml(tc.input), tc.expected);
        });
      }
    });

    /** 未知キー・型不一致でエラーがスローされるケース。 */
    describe('When: 異常系', () => {
      for (const tc of _errorCases) {
        it(`[Error] ${tc.id}: ${tc.label}`, async () => {
          const _config = await GlobalConfig.getInstance();
          assertThrows(() => _config.parseYaml(tc.input), tc.errorType);
        });
      }
    });

    /** null/undefined 境界値のケース。 */
    describe('When: エッジケース', () => {
      for (const tc of _edgeCases) {
        it(`[Edge] ${tc.id}: ${tc.label}`, async () => {
          const _config = await GlobalConfig.getInstance();
          assertEquals(_config.parseYaml(tc.input), tc.expected);
        });
      }
    });
  });

  // ─── loadConfigFile ───────────────────────────────────────────────────────

  /**
   * `loadConfigFile` のファイル読み込み・YAML パーステスト。
   *
   * 純粋関数性（_fields を変更しない）・NotFound 変換・InvalidYaml を検証する。
   */
  describe('loadConfigFile', () => {
    /** YAML を読み込んで Partial<ConfigValues> を返すケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-GC-30: configPath に絶対パスを渡す → YAML を読み込んで Partial を返す', async () => {
        const _config = await GlobalConfig.getInstance();
        const _result = await _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_result, { agent: 'chatgpt' });
      });

      it('[Normal] T-CLS-GC-31: configPath 絶対パス指定 → そのパスから YAML を読む（readTextFileProvider が呼ばれたパスを検証）', async () => {
        const _config = await GlobalConfig.getInstance();
        let _calledPath = '';
        const _trackingRead: ReadTextFileProvider = (path: string) => {
          _calledPath = path;
          return Promise.resolve('agent: chatgpt\n');
        };
        await _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _trackingRead,
        });
        assertEquals(_calledPath, '/mock/config.yaml');
      });

      it('[Normal] T-CLS-GC-32: loadConfigFile 後も get("agent") は DEFAULT_VALUES の値のまま（純粋関数性）', async () => {
        const _config = await GlobalConfig.getInstance();
        await _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Normal] T-CLS-GC-33: 複数フィールドの YAML が全フィールド正しく変換される', async () => {
        const _config = await GlobalConfig.getInstance();
        const _yaml = 'agent: chatgpt\ntimeoutMs: 60000\n';
        const _result = await _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk(_yaml),
        });
        assertEquals(_result, { agent: 'chatgpt', timeoutMs: 60000 });
      });
    });

    /** ファイル不在・不正 YAML でエラーが発生するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-GC-34: readTextFileProvider が NotFound → ChatlogError の kind が FileDirNotFound で reject', async () => {
        const _config = await GlobalConfig.getInstance();
        const _err = await assertRejects(
          () =>
            _config.loadConfigFile({
              configPath: '/mock/missing.yaml',
              readTextFileProvider: _notFoundRead,
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'FileDirNotFound');
      });

      it('[Error] T-CLS-GC-35: 不正な YAML 文字列 → ChatlogError の kind が InvalidYaml で reject', async () => {
        const _config = await GlobalConfig.getInstance();
        const _err = await assertRejects(
          () =>
            _config.loadConfigFile({
              configPath: '/mock/config.yaml',
              readTextFileProvider: _makeReadOk('key: [unclosed'),
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'YamlSyntaxError');
      });

      it('[Error] T-CLS-GC-36: YAML ルートがスカラー（文字列） → ChatlogError の kind が InvalidYaml で reject', async () => {
        const _config = await GlobalConfig.getInstance();
        const _err = await assertRejects(
          () =>
            _config.loadConfigFile({
              configPath: '/mock/config.yaml',
              readTextFileProvider: _makeReadOk('just a string\n'),
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'NotObject');
      });

      it('[Error] T-CLS-GC-37: スキーマ違反キー → ChatlogError の kind が InvalidYaml で reject', async () => {
        const _config = await GlobalConfig.getInstance();
        const _err = await assertRejects(
          () =>
            _config.loadConfigFile({
              configPath: '/mock/config.yaml',
              readTextFileProvider: _makeReadOk('unknownKey: someValue\n'),
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'UnknownKey');
      });
    });
  });
});

// ─── DEFAULT_CONFIG_FILE 定数検証 ────────────────────────────────────────────

/**
 * `DEFAULT_CONFIG_FILE` 定数のテストスイート。
 *
 * テスト ID: T-CLS-GC-60
 *
 * @see DEFAULT_CONFIG_FILE
 */
describe('DEFAULT_CONFIG_FILE', () => {
  it('[Normal] T-CLS-GC-60: DEFAULT_CONFIG_FILE が "assets/configs/config.yaml" である', () => {
    assertEquals(DEFAULT_CONFIG_FILE, 'assets/configs/config.yaml');
  });
});
