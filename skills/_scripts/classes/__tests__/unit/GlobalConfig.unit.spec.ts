// src: skills/_scripts/classes/__tests__/unit/GlobalConfig.unit.spec.ts
// @(#): GlobalConfig シングルトン ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- BDD modules ---
import { assertEquals, assertRejects, assertStrictEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// --- Test target ---
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// --- Helper
// stub providers
import type { ReadTextFileProvider, StatProvider } from '../../../types/providers.types.ts';
// constants
import { DEFAULT_CONFIG_FILE } from '../../../constants/defaults.constants.ts';
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─────────────────────────────────────────────
// parseYaml パラメータテーブル 型定義
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// GlobalConfig
// ─────────────────────────────────────────────

describe('GlobalConfig', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── getInstance ───────────────────────────────────────────────────────────

  describe('getInstance', () => {
    it('T-CLS-GC-01: 2 回の getInstance は同一参照を返す', async () => {
      const _a = await GlobalConfig.getInstance();
      const _b = await GlobalConfig.getInstance();
      assertStrictEquals(_a, _b);
    });

    it('T-CLS-GC-02: 異なる変数から取得しても同じ状態を持つ', async () => {
      const _first = await GlobalConfig.getInstance();
      const _second = await GlobalConfig.getInstance();
      assertEquals(_first.get('agent'), _second.get('agent'));
    });
  });

  // ─── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('T-CLS-GC-03: 設定済みキーの値を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.get('model'), 'sonnet');
    });

    it('T-CLS-GC-04: 存在しないキーは undefined を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.get('unknown'), undefined);
    });
  });

  // ─── parseYaml ─────────────────────────────────────────────────────────────

  describe('parseYaml', () => {
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

    for (const tc of _happyCases) {
      it(`${tc.id}: ${tc.label}`, async () => {
        const _config = await GlobalConfig.getInstance();
        assertEquals(_config.parseYaml(tc.input), tc.expected);
      });
    }

    for (const tc of _edgeCases) {
      it(`${tc.id}: ${tc.label}`, async () => {
        const _config = await GlobalConfig.getInstance();
        assertEquals(_config.parseYaml(tc.input), tc.expected);
      });
    }

    for (const tc of _errorCases) {
      it(`${tc.id}: ${tc.label}`, async () => {
        const _config = await GlobalConfig.getInstance();
        assertThrows(() => _config.parseYaml(tc.input), tc.errorType);
      });
    }
  });

  // ─── loadConfigFile ────────────────────────────────────────────────────────

  describe('loadConfigFile', () => {
    // ─── test helpers ───────────────────────────────────────────────────────
    const _makeReadOk = (content: string): ReadTextFileProvider => (_path: string) => Promise.resolve(content);
    const _existsStat: StatProvider = (_path: string) => Promise.resolve({ isFile: true } as Deno.FileInfo);
    const _notFoundStat: StatProvider = (_path: string) => Promise.reject(new Deno.errors.NotFound('no such file'));

    it('T-CLS-GC-30: configPath に絶対パスを渡す → YAMLを読み込んで Partial を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      const _result = await _config.loadConfigFile({
        configPath: '/mock/config.yaml',
        readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        statProvider: _existsStat,
      });
      assertEquals(_result, { agent: 'chatgpt' });
    });

    it('T-CLS-GC-31: configPath 絶対パス指定 → そのパスから YAML を読む（readTextFileProvider が呼ばれたパスを検証）', async () => {
      const _config = await GlobalConfig.getInstance();
      let _calledPath = '';
      const _trackingRead: ReadTextFileProvider = (path: string) => {
        _calledPath = path;
        return Promise.resolve('agent: chatgpt\n');
      };
      await _config.loadConfigFile({
        configPath: '/mock/config.yaml',
        readTextFileProvider: _trackingRead,
        statProvider: _existsStat,
      });
      assertEquals(_calledPath, '/mock/config.yaml');
    });

    it('T-CLS-GC-32: loadConfigFile 後も get("agent") は DEFAULT_VALUES の値のまま（純粋関数性）', async () => {
      const _config = await GlobalConfig.getInstance();
      await _config.loadConfigFile({
        configPath: '/mock/config.yaml',
        readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        statProvider: _existsStat,
      });
      assertEquals(_config.get('agent'), 'claude');
    });

    it('T-CLS-GC-33: 複数フィールドのYAMLが全フィールド正しく変換される（正常系）', async () => {
      const _config = await GlobalConfig.getInstance();
      const _yaml = 'agent: chatgpt\ntimeoutMs: 60000\n';
      const _result = await _config.loadConfigFile({
        configPath: '/mock/config.yaml',
        readTextFileProvider: _makeReadOk(_yaml),
        statProvider: _existsStat,
      });
      assertEquals(_result, { agent: 'chatgpt', timeoutMs: 60000 });
    });

    it('T-CLS-GC-34: statProvider が NotFound → ChatlogError の kind が FileDirNotFound で reject', async () => {
      const _config = await GlobalConfig.getInstance();
      const _err = await assertRejects(
        () =>
          _config.loadConfigFile({
            configPath: '/mock/missing.yaml',
            readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
            statProvider: _notFoundStat,
          }),
        ChatlogError,
      );
      assertEquals(_err.kind, 'FileDirNotFound');
    });

    it('T-CLS-GC-35: 不正なYAML文字列 → ChatlogError の kind が InvalidYaml で reject', async () => {
      const _config = await GlobalConfig.getInstance();
      const _err = await assertRejects(
        () =>
          _config.loadConfigFile({
            configPath: '/mock/config.yaml',
            readTextFileProvider: _makeReadOk('key: [unclosed'),
            statProvider: _existsStat,
          }),
        ChatlogError,
      );
      assertEquals(_err.kind, 'InvalidYaml');
    });

    it('T-CLS-GC-36: YAMLルートがスカラー（文字列） → ChatlogError の kind が InvalidYaml で reject', async () => {
      const _config = await GlobalConfig.getInstance();
      const _err = await assertRejects(
        () =>
          _config.loadConfigFile({
            configPath: '/mock/config.yaml',
            readTextFileProvider: _makeReadOk('just a string\n'),
            statProvider: _existsStat,
          }),
        ChatlogError,
      );
      assertEquals(_err.kind, 'InvalidYaml');
    });

    it('T-CLS-GC-37: スキーマ違反キー → ChatlogError の kind が InvalidYaml で reject', async () => {
      const _config = await GlobalConfig.getInstance();
      const _err = await assertRejects(
        () =>
          _config.loadConfigFile({
            configPath: '/mock/config.yaml',
            readTextFileProvider: _makeReadOk('unknownKey: someValue\n'),
            statProvider: _existsStat,
          }),
        ChatlogError,
      );
      assertEquals(_err.kind, 'InvalidYaml');
    });
  });

  // ─── getInstance with configFile ───────────────────────────────────────────

  describe('getInstance with configFile', () => {
    const _existsStat: StatProvider = (_path) => Promise.resolve({ isFile: true } as Deno.FileInfo);
    const _notFoundStat: StatProvider = (_path) => Promise.reject(new Deno.errors.NotFound('no such file'));
    const _makeReadOk = (content: string): ReadTextFileProvider => (_path) => Promise.resolve(content);

    it('T-CLS-GC-40: 引数なしで呼ぶと get("agent") が DEFAULT_VALUES の値を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.get('agent'), 'claude');
    });

    it('T-CLS-GC-41: configFile 指定+存在+valid YAML → get("agent") がYAML値を返す', async () => {
      const _config = await GlobalConfig.getInstance({
        configFile: '/mock/config.yaml',
        readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        statProvider: _existsStat,
      });
      assertEquals(_config.get('agent'), 'chatgpt');
    });

    it('T-CLS-GC-42: configFile 指定+存在しない → エラーなし、get("agent") が DEFAULT_VALUES の値を返す', async () => {
      const _config = await GlobalConfig.getInstance({
        configFile: '/mock/missing.yaml',
        readTextFileProvider: _makeReadOk('agent: chatgpt\n'),
        statProvider: _notFoundStat,
      });
      assertEquals(_config.get('agent'), 'claude');
    });

    it('T-CLS-GC-43: configFile 指定+不正YAML → ChatlogError の kind が InvalidYaml で reject', async () => {
      const _err = await assertRejects(
        () =>
          GlobalConfig.getInstance({
            configFile: '/mock/config.yaml',
            readTextFileProvider: _makeReadOk('key: [unclosed'),
            statProvider: _existsStat,
          }),
        ChatlogError,
      );
      assertEquals(_err.kind, 'InvalidYaml');
    });

    it('T-CLS-GC-44: getInstance() の戻り値と再取得が同一参照', async () => {
      const _created = await GlobalConfig.getInstance();
      const _got = await GlobalConfig.getInstance();
      assertStrictEquals(_created, _got);
    });
  });

  // ─── chatlogDir ────────────────────────────────────────────────────────────

  describe('chatlogDir', () => {
    const _existsStat: StatProvider = (_path) => Promise.resolve({ isFile: true } as Deno.FileInfo);
    const _makeReadOk = (content: string): ReadTextFileProvider => (_path) => Promise.resolve(content);

    it('T-CLS-GC-50: get("chatlogDir") がデフォルト値 "./chatlog" を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.get('chatlogDir'), './chatlog');
    });

    it('T-CLS-GC-51: parseYaml({ chatlogDir: "/custom/chatlog" }) が正しく返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.parseYaml({ chatlogDir: '/custom/chatlog' }), { chatlogDir: '/custom/chatlog' });
    });

    it('T-CLS-GC-52: parseYaml({ chatlogDir: null }) が { chatlogDir: "" } を返す', async () => {
      const _config = await GlobalConfig.getInstance();
      assertEquals(_config.parseYaml({ chatlogDir: null }), { chatlogDir: '' });
    });

    it('T-CLS-GC-53: parseYaml({ chatlogDir: 42 }) が TypeError をスローする', async () => {
      const _config = await GlobalConfig.getInstance();
      assertThrows(() => _config.parseYaml({ chatlogDir: 42 }), TypeError);
    });

    it('T-CLS-GC-54: loadConfigFile で chatlogDir を含む YAML が正しく変換される', async () => {
      const _config = await GlobalConfig.getInstance();
      const _result = await _config.loadConfigFile({
        configPath: '/mock/config.yaml',
        readTextFileProvider: _makeReadOk('chatlogDir: /custom/chatlog\n'),
        statProvider: _existsStat,
      });
      assertEquals(_result, { chatlogDir: '/custom/chatlog' });
    });
  });
});

// ─────────────────────────────────────────────
// DEFAULT_CONFIG_FILE 定数検証
// ─────────────────────────────────────────────

describe('DEFAULT_CONFIG_FILE', () => {
  it('T-CLS-GC-60: DEFAULT_CONFIG_FILE が "assets/configs/config.yaml" である', () => {
    assertEquals(DEFAULT_CONFIG_FILE, 'assets/configs/config.yaml');
  });
});
