// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.llamaEndpoint.unit.spec.ts
// @(#): GlobalConfig の llamaEndpoint キー解決 ユニットテスト
//       対象: GlobalConfig / DEFAULT_CONFIG_SCHEMA / DEFAULT_CONFIG_VALUES / KNOWN_AGENTS / isKnownAgent
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words imeout

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
// constants
import { isKnownAgent, KNOWN_AGENTS } from '../../../constants/agents.constants.ts';
import { DEFAULT_CONFIG_SCHEMA, DEFAULT_CONFIG_VALUES } from '../../../constants/config-schema.constants.ts';

// ─── Internal Helpers

// types

/** llamaEndpoint の解決結果を検証するテストケース。 */
type EndpointCase = {
  /** チェックリスト上のケース ID（例: `T-04-01-01`）。 */
  caseId: string;
  /** テスト ID（例: `T-CLS-GCL-01-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** 解決後に期待する `llamaEndpoint` の値。 */
  expected: string;
};

/** 複数の設定キーが互いに影響せず解決されることを検証するテストケース。 */
type AxisCase = {
  /** チェックリスト上のケース ID（例: `T-04-02-01`）。 */
  caseId: string;
  /** テスト ID（例: `T-CLS-GCL-02-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** 解決後に期待する `agent` の値。 */
  expectedAgent: string;
  /** 解決後に期待する `model` の値。 */
  expectedModel: string;
};

// functions

/**
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * `beforeEach` で `resetInstance()` 済みであることを前提に `getInstance({ yaml })` を呼ぶ。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
const _makeConfig = (yaml: string): GlobalConfig => GlobalConfig.getInstance({ yaml });

// cases

/** 正常系: llamaEndpoint が解決されるケース。 */
const _normalCases: EndpointCase[] = [
  {
    caseId: 'T-04-01-01',
    testId: 'T-CLS-GCL-01-01',
    label: 'llamaEndpoint に指定した値がそのまま解決される',
    yaml: 'llamaEndpoint: http://192.168.1.10:8080\n',
    expected: 'http://192.168.1.10:8080',
  },
  {
    caseId: 'T-04-01-02',
    testId: 'T-CLS-GCL-01-02',
    label: '他キーと同時指定でも llamaEndpoint が独立に解決される',
    yaml: 'agent: chatgpt\nmodel: llama/qwen3-14b\nllamaEndpoint: http://192.168.1.10:8080\n',
    expected: 'http://192.168.1.10:8080',
  },
];

/** 正常系: agent と model が互いに影響せず解決されるケース。 */
const _axisCases: AxisCase[] = [
  {
    caseId: 'T-04-02-01',
    testId: 'T-CLS-GCL-02-01',
    label: 'agent の値が model の解決に影響されない',
    yaml: 'agent: chatgpt\nmodel: llama/qwen3-14b\n',
    expectedAgent: 'chatgpt',
    expectedModel: 'llama/qwen3-14b',
  },
];

/** エッジケース: llamaEndpoint が空文字列に収束する各同値クラス。 */
const _edgeCases: EndpointCase[] = [
  {
    caseId: 'T-04-03-01',
    testId: 'T-CLS-GCL-03-01',
    label: 'llamaEndpoint 省略時は例外なく空文字列が解決される',
    yaml: 'agent: chatgpt\n',
    expected: '',
  },
  {
    caseId: 'T-04-04-01',
    testId: 'T-CLS-GCL-04-01',
    label: 'llamaEndpoint に空文字列を明示しても空文字列に収束する',
    yaml: "llamaEndpoint: ''\n",
    expected: '',
  },
  {
    caseId: 'T-04-07-01',
    testId: 'T-CLS-GCL-07-01',
    label: 'llamaEndpoint に null を明示しても空文字列に収束する',
    yaml: 'llamaEndpoint: null\n',
    expected: '',
  },
];

// ─── Tests

/**
 * `GlobalConfig` の `llamaEndpoint` キー解決に関するユニットテストスイート。
 *
 * 値付き指定・省略・空文字列・null・非文字列の各同値クラスと、
 * agent 軸の独立性・経路別タイムアウトキー不在の回帰ガードを検証する。
 *
 * テスト ID 範囲: T-CLS-GCL-01-01 〜 T-CLS-GCL-07-01
 *
 * @see GlobalConfig
 */
describe('GlobalConfig llamaEndpoint', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  describe('llamaEndpoint の解決', () => {
    describe('When: 正常系', () => {
      for (const _case of _normalCases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          assertEquals(_makeConfig(_case.yaml).get('llamaEndpoint'), _case.expected);
        });
      }

      for (const _case of _axisCases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          const _config = _makeConfig(_case.yaml);
          assertEquals(_config.get('agent'), _case.expectedAgent);
          assertEquals(_config.get('model'), _case.expectedModel);
        });
      }
    });

    describe('When: 異常系', () => {
      it('[Error] T-CLS-GCL-06-01: llamaEndpoint が文字列以外 → parseString の TypeError が伝播する', () => {
        assertThrows(
          () => _makeConfig('llamaEndpoint: 8080\n'),
          TypeError,
          'Unsupported type: number',
        );
        assertThrows(
          () => _makeConfig('llamaEndpoint: true\n'),
          TypeError,
          'Unsupported type: boolean',
        );
      });
    });

    describe('When: エッジケース', () => {
      for (const _case of _edgeCases) {
        it(`[Edge] ${_case.testId}: ${_case.label}`, () => {
          assertEquals(_makeConfig(_case.yaml).get('llamaEndpoint'), _case.expected);
        });
      }
    });
  });

  describe('agent 軸との独立性', () => {
    it('[Normal] T-CLS-GCL-02-02: agent の既知一覧に llama が現れない', () => {
      const _agents: readonly string[] = KNOWN_AGENTS;
      assertFalse(_agents.includes('llama'));
      assertFalse(isKnownAgent('llama'));
    });
  });

  describe('設定スキーマの経路別キー', () => {
    it('[Edge] T-CLS-GCL-05-01: llama 経路専用のタイムアウト設定キーがスキーマに存在しない', () => {
      const _schemaKeys = Object.keys(DEFAULT_CONFIG_SCHEMA);
      const _valueKeys = Object.keys(DEFAULT_CONFIG_VALUES);

      assertFalse(_schemaKeys.includes('llamaTimeoutMs'));
      assertFalse(_valueKeys.includes('llamaTimeoutMs'));
      assertEquals([..._schemaKeys, ..._valueKeys].filter((k) => /^llama.*[Tt]imeout/i.test(k)), []);
      assert(_schemaKeys.includes('timeoutMs'));
      assert(_valueKeys.includes('timeoutMs'));
    });
  });
});
