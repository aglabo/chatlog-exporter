// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.debug.unit.spec.ts
// @(#): GlobalConfig の debug キー（boolean 設定値）解決 ユニットテスト
//       対象: GlobalConfig / DEFAULT_CONFIG_SCHEMA / DEFAULT_CONFIG_VALUES
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStrictEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─── Internal Helpers

// types

/** debug の解決結果を検証するテストケース。 */
type _DebugCase = {
  /** テスト ID（例: `T-CLS-GCD-01-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** 解決後に期待する `debug` の値。 */
  expected: boolean;
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

// ─── Tests

/**
 * `GlobalConfig` の `debug` キー解決に関するユニットテストスイート。
 *
 * boolean 型の設定値の受理・既定値・型不一致の拒否と、
 * 廃止した `aiLogLevel` キーが不明キーとして拒否されることを検証する。
 *
 * @see GlobalConfig
 */
describe('GlobalConfig debug', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  describe('debug の解決', () => {
    /** boolean を明示指定する正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: _DebugCase[] = [
        { testId: 'T-CLS-GCD-01-01', label: 'debug: true → true が解決される', yaml: 'debug: true\n', expected: true },
        {
          testId: 'T-CLS-GCD-01-02',
          label: 'debug: false → false が解決される',
          yaml: 'debug: false\n',
          expected: false,
        },
      ];

      for (const _case of _cases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          assertStrictEquals(_makeConfig(_case.yaml).get('debug'), _case.expected);
        });
      }
    });

    /** 型不一致・廃止キーでエラーがスローされるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-GCD-02-01: debug に文字列 → parseBoolean の TypeError が伝播する', () => {
        assertThrows(() => _makeConfig('debug: "yes"\n'), TypeError, 'Unsupported type: string');
      });

      it('[Error] T-CLS-GCD-02-02: 廃止した aiLogLevel キー → ChatlogError(InvalidYaml/UnknownKey)', () => {
        const _err = assertThrows(() => _makeConfig('aiLogLevel: debug\n'), ChatlogError);
        assertEquals(_err.kind, 'InvalidYaml');
        assertEquals(_err.subindex, 'UnknownKey');
      });
    });

    /** 省略・null など既定値に収束するケース。 */
    describe('When: エッジケース', () => {
      const _cases: _DebugCase[] = [
        {
          testId: 'T-CLS-GCD-03-01',
          label: 'debug 省略時は既定値 false が解決される',
          yaml: 'agent: claude\n',
          expected: false,
        },
        {
          testId: 'T-CLS-GCD-03-02',
          label: 'debug: null は既定値 false に収束する',
          yaml: 'debug: null\n',
          expected: false,
        },
      ];

      for (const _case of _cases) {
        it(`[Edge] ${_case.testId}: ${_case.label}`, () => {
          assertStrictEquals(_makeConfig(_case.yaml).get('debug'), _case.expected);
        });
      }
    });
  });
});
