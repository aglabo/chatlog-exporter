// src: skills/_scripts/classes/__tests__/unit/GlobalConfig.unit.spec.ts
// @(#): GlobalConfig シングルトン ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertFalse, assertStrictEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
// types
import type { ReadTextFileSyncProvider } from '../../../types/providers.types.ts';
// constants
import { DEFAULT_VALUES } from '../../../constants/schema.constants.ts';
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

/** ファイル読み込みを成功させる `ReadTextFileSyncProvider` スタブ。指定内容を返す。 */
const _makeReadOk = (content: string): ReadTextFileSyncProvider => (_path: string) => content;

/** ファイル未存在を模倣する `ReadTextFileSyncProvider`。`Deno.errors.NotFound` を throw する。 */
const _notFoundRead: ReadTextFileSyncProvider = () => {
  throw new Deno.errors.NotFound('no such file');
};

// ─── Tests

/**
 * `GlobalConfig` クラスのユニットテストスイート。
 *
 * シングルトン取得・値参照・YAML パース・ファイル読み込みを検証する。
 *
 * テスト ID 範囲: T-CLS-GC-01 〜 T-CLS-GC-86
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
      it('[Normal] T-CLS-GC-01: 2 回の getInstance は同一参照を返す', () => {
        const _a = GlobalConfig.getInstance();
        const _b = GlobalConfig.getInstance();
        assertStrictEquals(_a, _b);
      });

      it('[Normal] T-CLS-GC-02: 異なる変数から取得しても同じ状態を持つ', () => {
        const _first = GlobalConfig.getInstance();
        const _second = GlobalConfig.getInstance();
        assertEquals(_first.get('agent'), _second.get('agent'));
      });

      it('[Normal] T-CLS-GC-40: 引数なしで呼ぶと get("agent") が DEFAULT_VALUES の値を返す', () => {
        const _config = GlobalConfig.getInstance();
        assertEquals(_config.get('agent'), 'claude');
        assertEquals(_config.get('chatlogsDir'), './chatlogs');
      });

      it('[Normal] T-CLS-GC-41: configFile 指定+存在+valid YAML → get("agent") が YAML 値を返す', () => {
        const _config = GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
      });

      it('[Normal] T-CLS-GC-61: yaml で chatlogsDir が設定される', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'chatlogsDir: /tmp/test-chatlogs\n' });
        assertEquals(_config.get('chatlogsDir'), '/tmp/test-chatlogs');
      });

      it('[Normal] T-CLS-GC-62: yaml と configFile が両方指定されたとき yaml が優先され readTextFileProvider は呼ばれない', () => {
        const _called = { flag: false };
        const _trackingRead: ReadTextFileSyncProvider = (_path: string) => {
          _called.flag = true;
          return 'agent: chatgpt\n';
        };
        const _config = GlobalConfig.getInstance({
          yaml: 'chatlogsDir: /tmp/yaml-wins\n',
          configFile: '/mock/config.yaml',
          readTextFileProvider: _trackingRead,
        });
        assertEquals(_config.get('chatlogsDir'), '/tmp/yaml-wins');
        assertFalse(_called.flag);
      });

      it('[Normal] T-CLS-GC-74: yaml で maxContentLength: 2000 を指定すると get() が 2000 を返す', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'maxContentLength: 2000\n' });
        assertEquals(_config.get('maxContentLength'), 2000);
      });

      it('[Normal] T-CLS-GC-68: yaml で複数フィールドを指定すると get() で反映が確認できる', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'agent: chatgpt\nchatlogsDir: /tmp/logs\n' });
        assertEquals(_config.get('agent'), 'chatgpt');
        assertEquals(_config.get('chatlogsDir'), '/tmp/logs');
      });

      it('[Normal] T-CLS-GC-69: configFile 経由でフィールドが反映され get() で確認できる', () => {
        const _config = GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\ntimeoutMs: 30000\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
        assertEquals(_config.get('timeoutMs'), 30000);
      });

      it('[Normal] T-CLS-GC-70: yaml と configFile 両方指定時、yaml の agent が get() で反映される', () => {
        const _config = GlobalConfig.getInstance({
          yaml: 'agent: chatgpt\n',
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: claude\n'),
        });
        assertEquals(_config.get('agent'), 'chatgpt');
      });
    });

    /** 不正な YAML でエラーがスローされるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-GC-43: configFile 指定+不正 YAML → ChatlogError(InvalidYaml) がスローされる', () => {
        const _err = assertThrows(
          () =>
            GlobalConfig.getInstance({
              configFile: '/mock/config.yaml',
              readTextFileProvider: _makeReadOk('key: [unclosed'),
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
      });

      it('[Error] T-CLS-GC-64: yaml が不正 YAML 構文のとき ChatlogError(InvalidYaml) がスローされる', () => {
        const _err = assertThrows(
          () => GlobalConfig.getInstance({ yaml: 'key: [unclosed' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
      });

      it('[Error] T-CLS-GC-71: yaml に未知キーがあると ChatlogError(InvalidYaml/UnknownKey) がスローされる', () => {
        const _err = assertThrows(
          () => GlobalConfig.getInstance({ yaml: 'unknownKey: value\n' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'UnknownKey');
      });

      it('[Error] T-CLS-GC-72: yaml のルートがスカラー値のとき ChatlogError(InvalidYaml/NotObject) がスローされる', () => {
        const _err = assertThrows(
          () => GlobalConfig.getInstance({ yaml: 'just-a-string\n' }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'NotObject');
      });
    });

    /** 境界値・副作用・優先度など特殊なケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-GC-42: configFile 指定+存在しない → エラーなし、get("agent") が DEFAULT_VALUES の値を返す', () => {
        const _config = GlobalConfig.getInstance({
          configFile: '/mock/missing.yaml',
          readTextFileProvider: _notFoundRead,
        });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-44: getInstance() の戻り値と再取得が同一参照', () => {
        const _created = GlobalConfig.getInstance();
        const _got = GlobalConfig.getInstance();
        assertStrictEquals(_created, _got);
      });

      it('[Edge] T-CLS-GC-63: yaml が空文字列のときデフォルト値が使われる', () => {
        const _config = GlobalConfig.getInstance({ yaml: '' });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-65: 既存インスタンスがある場合 yaml オプションは無視される', () => {
        const _first = GlobalConfig.getInstance();
        assertEquals(_first.get('agent'), 'claude');
        const _second = GlobalConfig.getInstance({ yaml: 'agent: chatgpt\n' });
        assertStrictEquals(_first, _second);
        assertEquals(_second.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-66: 既存インスタンスがある場合 configFile オプションは無視される', () => {
        const _first = GlobalConfig.getInstance();
        const _second = GlobalConfig.getInstance({
          configFile: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertStrictEquals(_first, _second);
        assertEquals(_second.get('agent'), 'claude');
      });

      it('[Edge] T-CLS-GC-78: yaml で cacheDir: /tmp/my-cache を指定すると get("cacheDir") がその値を返す', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'cacheDir: /tmp/my-cache\n' });
        assertEquals(_config.get('cacheDir'), '/tmp/my-cache');
      });

      it('[Edge] T-CLS-GC-79: yaml に cacheDir キーがない場合は get("cacheDir") がデフォルト値を返す', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'agent: chatgpt\n' });
        assertEquals(_config.get('cacheDir'), '${TEMP}/cle-cache');
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
    it('[Normal] T-CLS-GC-03: 設定済みキーの値を返す', () => {
      const _config = GlobalConfig.getInstance();
      assertEquals(_config.get('model'), 'sonnet');
    });
  });

  // ─── values ──────────────────────────────────────────────────────────────

  /**
   * `values` の全フィールド取得テスト。
   *
   * DEFAULT_VALUES との一致・YAML 上書き後の反映を検証する。
   */
  describe('values', () => {
    /** getInstance 直後・YAML 上書き後の全フィールド取得ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-GC-81: getInstance 直後は DEFAULT_VALUES と一致する全フィールドを返す', () => {
        const _config = GlobalConfig.getInstance();
        assertEquals(_config.values(), DEFAULT_VALUES);
      });

      it('[Normal] T-CLS-GC-82: YAML で agent を上書き後、agent は新しい値・他は DEFAULT_VALUES のままの全フィールドを返す', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'agent: chatgpt\n' });
        assertEquals(_config.values(), { ...DEFAULT_VALUES, agent: 'chatgpt' });
      });
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
      {
        id: 'T-CLS-GC-80',
        label: 'string フィールド cacheDir に number 型は TypeError をスローする',
        input: { cacheDir: 42 },
        errorType: TypeError,
      },
    ];

    /** string/number フィールドが正しく変換されるケース。 */
    describe('When: 正常系', () => {
      for (const tc of _happyCases) {
        it(`[Normal] ${tc.id}: ${tc.label}`, () => {
          const _config = GlobalConfig.getInstance();
          assertEquals(_config.parseYaml(tc.input), tc.expected);
        });
      }
    });

    /** 未知キー・型不一致でエラーがスローされるケース。 */
    describe('When: 異常系', () => {
      for (const tc of _errorCases) {
        it(`[Error] ${tc.id}: ${tc.label}`, () => {
          const _config = GlobalConfig.getInstance();
          assertThrows(() => _config.parseYaml(tc.input), tc.errorType);
        });
      }
    });

    /** null/undefined 境界値のケース。 */
    describe('When: エッジケース', () => {
      for (const tc of _edgeCases) {
        it(`[Edge] ${tc.id}: ${tc.label}`, () => {
          const _config = GlobalConfig.getInstance();
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
      it('[Normal] T-CLS-GC-30: configPath に絶対パスを渡す → YAML を読み込んで Partial を返す', () => {
        const _config = GlobalConfig.getInstance();
        const _result = _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_result, { agent: 'chatgpt' });
      });

      it('[Normal] T-CLS-GC-31: configPath 絶対パス指定 → そのパスから YAML を読む（readTextFileProvider が呼ばれたパスを検証）', () => {
        const _config = GlobalConfig.getInstance();
        let _calledPath = '';
        const _trackingRead: ReadTextFileSyncProvider = (path: string) => {
          _calledPath = path;
          return 'agent: chatgpt\n';
        };
        _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _trackingRead,
        });
        assertEquals(_calledPath, '/mock/config.yaml');
      });

      it('[Normal] T-CLS-GC-32: loadConfigFile 後も get("agent") は DEFAULT_VALUES の値のまま（純粋関数性）', () => {
        const _config = GlobalConfig.getInstance();
        _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        });
        assertEquals(_config.get('agent'), 'claude');
      });

      it('[Normal] T-CLS-GC-33: 複数フィールドの YAML が全フィールド正しく変換される', () => {
        const _config = GlobalConfig.getInstance();
        const _yaml = 'agent: chatgpt\ntimeoutMs: 60000\n';
        const _result = _config.loadConfigFile({
          configPath: '/mock/config.yaml',
          readTextFileProvider: _makeReadOk(_yaml),
        });
        assertEquals(_result, { agent: 'chatgpt', timeoutMs: 60000 });
      });
    });

    /** ファイル不在・不正 YAML でエラーが発生するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-GC-34: readTextFileProvider が NotFound → ChatlogError の kind が FileDirNotFound でスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(
          () =>
            _config.loadConfigFile({
              configPath: '/mock/missing.yaml',
              readTextFileProvider: _notFoundRead,
            }),
          ChatlogError,
        );
        assertEquals(_err.kind, 'FileDirNotFound');
      });

      it('[Error] T-CLS-GC-35: 不正な YAML 文字列 → ChatlogError の kind が InvalidYaml でスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(
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

      it('[Error] T-CLS-GC-36: YAML ルートがスカラー（文字列） → ChatlogError の kind が InvalidYaml でスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(
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

      it('[Error] T-CLS-GC-37: スキーマ違反キー → ChatlogError の kind が InvalidYaml でスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(
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
