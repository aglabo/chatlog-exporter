// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.unit.spec.ts
// @(#): GlobalConfig シングルトン ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertStrictEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
// types
import type { ReadTextFileSyncProvider } from '../../../types/providers.types.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../constants/config-schema.constants.ts';
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─── Internal Helpers

// types

/** テストケース: 正常系 */
type NormalCase = {
  id: string;
  label: string;
  input: string;
  expected: Record<string, string | number>;
};

/** テストケース: 異常系 */
// deno-lint-ignore no-explicit-any
type ErrorCase = { id: string; label: string; input: string; errorType: new(...args: any[]) => Error };

/** テストケース: エッジケース */
type EdgeCase = {
  id: string;
  label: string;
  input: string;
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
 * テスト ID 範囲: T-CLS-GC-01 〜 T-CLS-GC-141
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

      it('[Normal] T-CLS-GC-40: 引数なしで呼ぶと get("agent") が DEFAULT_CONFIG_VALUES の値を返す', () => {
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

      it('[Normal] T-CLS-GC-87: appName 指定時、loadConfigFile は .config/<appName>/config.yaml を読む', () => {
        let _calledPath = '';
        const _trackingRead: ReadTextFileSyncProvider = (path: string) => {
          _calledPath = path;
          return 'agent: chatgpt\n';
        };
        const _config = GlobalConfig.getInstance({ appName: 'my-app' });
        _config.loadConfigFile({ readTextFileProvider: _trackingRead });
        assert(_calledPath.endsWith('.config/my-app/config.yaml'));
      });

      it('[Normal] T-CLS-GC-88: appName 未指定時、loadConfigFile が .config/chatlog-exporter/config.yaml を読む', () => {
        let _calledPath = '';
        const _trackingRead: ReadTextFileSyncProvider = (path: string) => {
          _calledPath = path;
          return 'agent: chatgpt\n';
        };
        const _config = GlobalConfig.getInstance();
        _config.loadConfigFile({ readTextFileProvider: _trackingRead });
        assert(_calledPath.endsWith('.config/chatlog-exporter/config.yaml'));
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
      it('[Edge] T-CLS-GC-42: configFile 指定+存在しない → エラーなし、get("agent") が DEFAULT_CONFIG_VALUES の値を返す', () => {
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

      it('[Edge] T-CLS-GC-89: 既存インスタンスがある場合 appName オプションは無視される', () => {
        let _calledPath = '';
        const _trackingRead: ReadTextFileSyncProvider = (path: string) => {
          _calledPath = path;
          return 'agent: chatgpt\n';
        };
        const _first = GlobalConfig.getInstance();
        const _second = GlobalConfig.getInstance({ appName: 'other-app' });
        assertStrictEquals(_first, _second);
        _second.loadConfigFile({ readTextFileProvider: _trackingRead });
        assert(_calledPath.endsWith('.config/chatlog-exporter/config.yaml'));
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

  // ─── configDir ───────────────────────────────────────────────────────────

  /**
   * `configDir` getter のテスト。
   *
   * appName 未指定時は `.config/chatlog-exporter`、appName 指定時は `.config/<appName>` を返すことを検証する。
   */
  describe('configDir', () => {
    it('[Normal] T-CLS-GC-96: appName 未指定時、configDir は ".config/chatlog-exporter" を返す', () => {
      const _config = GlobalConfig.getInstance();
      assertEquals(_config.configDir, '.config/chatlog-exporter');
    });

    it('[Normal] T-CLS-GC-97: appName 指定時、configDir は ".config/<appName>" を返す', () => {
      const _config = GlobalConfig.getInstance({ appName: 'my-app' });
      assertEquals(_config.configDir, '.config/my-app');
    });
  });

  // ─── values ──────────────────────────────────────────────────────────────

  /**
   * `values` の全フィールド取得テスト。
   *
   * DEFAULT_CONFIG_VALUES との一致・YAML 上書き後の反映を検証する。
   */
  describe('values', () => {
    /** getInstance 直後・YAML 上書き後の全フィールド取得ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-GC-81: getInstance 直後は DEFAULT_CONFIG_VALUES と一致する全フィールドを返す', () => {
        const _config = GlobalConfig.getInstance();
        assertEquals(_config.values(), DEFAULT_CONFIG_VALUES);
      });

      it('[Normal] T-CLS-GC-82: YAML で agent を上書き後、agent は新しい値・他は DEFAULT_CONFIG_VALUES のままの全フィールドを返す', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'agent: chatgpt\n' });
        assertEquals(_config.values(), { ...DEFAULT_CONFIG_VALUES, agent: 'chatgpt' });
      });
    });
  });

  // ─── parseYaml ───────────────────────────────────────────────────────────

  /**
   * `parseYaml` の YAML テキストパース・スキーマ検証・型変換テスト。
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
        input: 'agent: claude\n',
        expected: { agent: 'claude' },
      },
      {
        id: 'T-CLS-GC-11',
        label: 'number フィールドの数値型はそのまま返す',
        input: 'timeoutMs: 120000\n',
        expected: { timeoutMs: 120000 },
      },
      {
        id: 'T-CLS-GC-12',
        label: 'number フィールドの数値文字列は数値に変換',
        input: "timeoutMs: '120_000'\n",
        expected: { timeoutMs: 120000 },
      },
      {
        id: 'T-CLS-GC-13',
        label: '複数フィールドを正しく変換して返す',
        input: 'agent: claude\ntimeoutMs: 30000\n',
        expected: { agent: 'claude', timeoutMs: 30000 },
      },
      { id: 'T-CLS-GC-14', label: '空オブジェクトは空オブジェクトを返す', input: '{}\n', expected: {} },
      {
        id: 'T-CLS-GC-104',
        label: 'chunkSize: 1（下限境界値）は範囲チェックでエラーにならない',
        input: 'chunkSize: 1\n',
        expected: { chunkSize: 1 },
      },
      {
        id: 'T-CLS-GC-105',
        label: 'chunkSize: 10（上限境界値）は範囲チェックでエラーにならない',
        input: 'chunkSize: 10\n',
        expected: { chunkSize: 10 },
      },
      {
        id: 'T-CLS-GC-106',
        label: 'concurrency: 1（下限境界値）は範囲チェックでエラーにならない',
        input: 'concurrency: 1\n',
        expected: { concurrency: 1 },
      },
      {
        id: 'T-CLS-GC-107',
        label: 'concurrency: 10（上限境界値）は範囲チェックでエラーにならない',
        input: 'concurrency: 10\n',
        expected: { concurrency: 10 },
      },
      {
        id: 'T-CLS-GC-110',
        label: 'timeoutMs: 0（下限境界値）は範囲チェックでエラーにならない',
        input: 'timeoutMs: 0\n',
        expected: { timeoutMs: 0 },
      },
      {
        id: 'T-CLS-GC-111',
        label: 'timeoutMs: 600000（上限境界値）は範囲チェックでエラーにならない',
        input: 'timeoutMs: 600000\n',
        expected: { timeoutMs: 600000 },
      },
      {
        id: 'T-CLS-GC-112',
        label: 'hashLength: 1（下限境界値）は範囲チェックでエラーにならない',
        input: 'hashLength: 1\n',
        expected: { hashLength: 1 },
      },
      {
        id: 'T-CLS-GC-113',
        label: 'hashLength: 64（上限境界値）は範囲チェックでエラーにならない',
        input: 'hashLength: 64\n',
        expected: { hashLength: 64 },
      },
      {
        id: 'T-CLS-GC-114',
        label: 'minRandomLength: 1（下限境界値）は範囲チェックでエラーにならない',
        input: 'minRandomLength: 1\n',
        expected: { minRandomLength: 1 },
      },
      {
        id: 'T-CLS-GC-115',
        label: 'minRandomLength: 64（上限境界値）は範囲チェックでエラーにならない',
        input: 'minRandomLength: 64\n',
        expected: { minRandomLength: 64 },
      },
      {
        id: 'T-CLS-GC-116',
        label: 'maxRandomLength: 1（下限境界値）は範囲チェックでエラーにならない',
        input: 'maxRandomLength: 1\n',
        expected: { maxRandomLength: 1 },
      },
      {
        id: 'T-CLS-GC-117',
        label: 'maxRandomLength: 64（上限境界値）は範囲チェックでエラーにならない',
        input: 'maxRandomLength: 64\n',
        expected: { maxRandomLength: 64 },
      },
      {
        id: 'T-CLS-GC-118',
        label: 'minCharCount: 0（下限境界値）は範囲チェックでエラーにならない',
        input: 'minCharCount: 0\n',
        expected: { minCharCount: 0 },
      },
      {
        id: 'T-CLS-GC-119',
        label: 'minCharCount: 100000（上限境界値）は範囲チェックでエラーにならない',
        input: 'minCharCount: 100000\n',
        expected: { minCharCount: 100000 },
      },
      {
        id: 'T-CLS-GC-120',
        label: 'minAssistantChars: 0（下限境界値）は範囲チェックでエラーにならない',
        input: 'minAssistantChars: 0\n',
        expected: { minAssistantChars: 0 },
      },
      {
        id: 'T-CLS-GC-121',
        label: 'minAssistantChars: 100000（上限境界値）は範囲チェックでエラーにならない',
        input: 'minAssistantChars: 100000\n',
        expected: { minAssistantChars: 100000 },
      },
      {
        id: 'T-CLS-GC-122',
        label: 'maxContentLength: 0（下限境界値）は範囲チェックでエラーにならない',
        input: 'maxContentLength: 0\n',
        expected: { maxContentLength: 0 },
      },
      {
        id: 'T-CLS-GC-123',
        label: 'maxContentLength: 100000（上限境界値）は範囲チェックでエラーにならない',
        input: 'maxContentLength: 100000\n',
        expected: { maxContentLength: 100000 },
      },
      {
        id: 'T-CLS-GC-124',
        label: 'discardThreshold: 0（下限境界値）は範囲チェックでエラーにならない',
        input: 'discardThreshold: 0\n',
        expected: { discardThreshold: 0 },
      },
      {
        id: 'T-CLS-GC-125',
        label: 'discardThreshold: 1（上限境界値）は範囲チェックでエラーにならない',
        input: 'discardThreshold: 1\n',
        expected: { discardThreshold: 1 },
      },
    ];

    /** エッジケーステストケーステーブル。 */
    const _edgeCases: EdgeCase[] = [
      {
        id: 'T-CLS-GC-16',
        label: "string フィールドの null は '' に変換される",
        input: 'agent: null\n',
        expected: { agent: '' },
      },
      { id: 'T-CLS-GC-17', label: 'number フィールドの null は省略される', input: 'timeoutMs: null\n', expected: {} },
    ];

    /** 異常系テストケーステーブル。 */
    const _errorCases: ErrorCase[] = [
      {
        id: 'T-CLS-GC-18',
        label: '未知キーは ChatlogError をスローする',
        input: 'unknownKey: value\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-19',
        label: 'string フィールドに number 型は TypeError をスローする',
        input: 'agent: 42\n',
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-20',
        label: 'number フィールドに非数値文字列は TypeError をスローする',
        input: 'timeoutMs: abc\n',
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-21',
        label: 'number フィールドに boolean は TypeError をスローする',
        input: 'timeoutMs: true\n',
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-22',
        label: '不明キーが混在しても ChatlogError をスローする',
        input: 'agent: claude\nbadKey: x\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-80',
        label: 'string フィールド cacheDir に number 型は TypeError をスローする',
        input: 'cacheDir: 42\n',
        errorType: TypeError,
      },
      {
        id: 'T-CLS-GC-98',
        label: 'chunkSize: 0 は範囲外のため ChatlogError をスローする',
        input: 'chunkSize: 0\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-99',
        label: 'chunkSize: 11 は範囲外のため ChatlogError をスローする',
        input: 'chunkSize: 11\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-100',
        label: 'chunkSize: -1 は範囲外のため ChatlogError をスローする',
        input: 'chunkSize: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-101',
        label: 'concurrency: 0 は範囲外のため ChatlogError をスローする',
        input: 'concurrency: 0\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-102',
        label: 'concurrency: 11 は範囲外のため ChatlogError をスローする',
        input: 'concurrency: 11\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-103',
        label: 'concurrency: -1 は範囲外のため ChatlogError をスローする',
        input: 'concurrency: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-126',
        label: 'timeoutMs: -1 は範囲外のため ChatlogError をスローする',
        input: 'timeoutMs: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-127',
        label: 'timeoutMs: 600001 は範囲外のため ChatlogError をスローする',
        input: 'timeoutMs: 600001\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-128',
        label: 'hashLength: 0 は範囲外のため ChatlogError をスローする',
        input: 'hashLength: 0\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-129',
        label: 'hashLength: 65 は範囲外のため ChatlogError をスローする',
        input: 'hashLength: 65\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-130',
        label: 'minRandomLength: 0 は範囲外のため ChatlogError をスローする',
        input: 'minRandomLength: 0\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-131',
        label: 'minRandomLength: 65 は範囲外のため ChatlogError をスローする',
        input: 'minRandomLength: 65\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-132',
        label: 'maxRandomLength: 0 は範囲外のため ChatlogError をスローする',
        input: 'maxRandomLength: 0\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-133',
        label: 'maxRandomLength: 65 は範囲外のため ChatlogError をスローする',
        input: 'maxRandomLength: 65\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-134',
        label: 'minCharCount: -1 は範囲外のため ChatlogError をスローする',
        input: 'minCharCount: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-135',
        label: 'minCharCount: 100001 は範囲外のため ChatlogError をスローする',
        input: 'minCharCount: 100001\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-136',
        label: 'minAssistantChars: -1 は範囲外のため ChatlogError をスローする',
        input: 'minAssistantChars: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-137',
        label: 'minAssistantChars: 100001 は範囲外のため ChatlogError をスローする',
        input: 'minAssistantChars: 100001\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-138',
        label: 'maxContentLength: -1 は範囲外のため ChatlogError をスローする',
        input: 'maxContentLength: -1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-139',
        label: 'maxContentLength: 100001 は範囲外のため ChatlogError をスローする',
        input: 'maxContentLength: 100001\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-140',
        label: 'discardThreshold: -0.1 は範囲外のため ChatlogError をスローする',
        input: 'discardThreshold: -0.1\n',
        errorType: ChatlogError,
      },
      {
        id: 'T-CLS-GC-141',
        label: 'discardThreshold: 1.1 は範囲外のため ChatlogError をスローする',
        input: 'discardThreshold: 1.1\n',
        errorType: ChatlogError,
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

      it('[Error] T-CLS-GC-108: chunkSize: 0 → ChatlogError(InvalidYaml/OutOfRange) がスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(() => _config.parseYaml('chunkSize: 0\n'), ChatlogError);
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'OutOfRange');
      });

      it('[Error] T-CLS-GC-109: concurrency: 11 → ChatlogError(InvalidYaml/OutOfRange) がスローされる', () => {
        const _config = GlobalConfig.getInstance();
        const _err = assertThrows(() => _config.parseYaml('concurrency: 11\n'), ChatlogError);
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'OutOfRange');
      });
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

      it('[Normal] T-CLS-GC-32: loadConfigFile 後も get("agent") は DEFAULT_CONFIG_VALUES の値のまま（純粋関数性）', () => {
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

      it('[Normal] T-CLS-GC-142: throwFileNotFound: false 指定+ファイル未存在 → 例外をスローせず {} を返す', () => {
        const _config = GlobalConfig.getInstance();
        const _result = _config.loadConfigFile({
          configPath: '/mock/missing.yaml',
          readTextFileProvider: _notFoundRead,
          throwFileNotFound: false,
        });
        assertEquals(_result, {});
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
        assert(_err.message.includes('/mock/missing.yaml'));
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
