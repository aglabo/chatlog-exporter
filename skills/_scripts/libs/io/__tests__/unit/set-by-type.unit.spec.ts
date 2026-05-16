// src: skills/_scripts/libs/io/__tests__/unit/set-by-type.unit.spec.ts
// @(#): _setByType のユニットテスト
//       対象: _setByType（parse-args.ts の内部関数、_setByTypeForTest としてエクスポート）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _setByTypeForTest } from '../../parse-args.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
// types
import type { ArgSchemaEntry } from '../../../../types/args-schema.types.ts';

// ─── Internal Helpers

// functions
/** テスト用に空の config オブジェクトを生成する。 */
const _makeConfig = (): Record<string, string | boolean | number> => ({});

/** 指定した type と field を持つ ArgSchemaEntry を生成する。 */
const _entry = (type: ArgSchemaEntry['type'], field = 'result'): ArgSchemaEntry => ({
  option: `--${field}`,
  field,
  type,
});

// ─── Tests

/**
 * `_setByType` のユニットテストスイート。
 *
 * 各型（flag / string / agent / integer / number / directory）の
 * 正常系・異常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-SBT-FL-01 〜 T-SBT-PR-06
 *
 * @see _setByTypeForTest
 */
describe('_setByType', () => {
  /**
   * `flag` 型の動作テスト。
   *
   * rawValue なし（undefined）のとき `config[field] = true` をセットし `null` を返す。
   * rawValue あり（`--flag=value` 形式）のとき `ChatlogError` を返すことを検証する。
   */
  describe('flag 型', () => {
    /** rawValue なし・undefined の各ケースで true がセットされる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-FL-01: rawValue なし → config[field] = true, result = null', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('flag'), undefined);
        assertEquals(config['result'], true);
        assertEquals(result, null);
      });
    });

    /** rawValue が指定された場合はエラーになる異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-FL-02: rawValue あり → ChatlogError を返す', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('flag'), 'ignored');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `string` 型の動作テスト。
   *
   * rawValue をそのまま `config[field]` にセットすることを検証する。
   * undefined や空文字列はエラーになることも検証する。
   */
  describe('string 型', () => {
    /** 有効な文字列を渡した正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-ST-01: rawValue "hello" → config[field] = "hello"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('string'), 'hello');
        assertEquals(config['result'], 'hello');
        assertEquals(result, null);
      });
    });

    /** rawValue が undefined または空文字列の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-ST-02: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('string'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-ST-03: rawValue "" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('string'), '');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `agent` 型の動作テスト。
   *
   * 既知エージェント名は正常にセットされ、未知エージェント名はエラーになることを検証する。
   */
  describe('agent 型', () => {
    /** 既知エージェント名（claude / chatgpt）の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-AG-01: rawValue "claude" → config[field] = "claude"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('agent'), 'claude');
        assertEquals(config['result'], 'claude');
        assertEquals(result, null);
      });

      it('[Normal] T-SBT-AG-02: rawValue "chatgpt" → config[field] = "chatgpt"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('agent'), 'chatgpt');
        assertEquals(config['result'], 'chatgpt');
        assertEquals(result, null);
      });
    });

    /** 未知エージェント名や undefined の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-AG-03: rawValue "unknown-bot" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('agent'), 'unknown-bot');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-AG-04: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('agent'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `integer` 型の動作テスト。
   *
   * 整数文字列は数値に変換してセットされることを検証する。
   */
  describe('integer 型', () => {
    /** 整数文字列・ゼロ・負数の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-IN-01: rawValue "42" → config[field] = 42 (number)', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('integer'), '42');
        assertEquals(config['result'], 42);
        assertEquals(result, null);
      });

      it('[Normal] T-SBT-IN-02: rawValue "0" → config[field] = 0', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('integer'), '0');
        assertEquals(config['result'], 0);
        assertEquals(result, null);
      });

      it('[Normal] T-SBT-IN-03: rawValue "-5" → config[field] = -5', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('integer'), '-5');
        assertEquals(config['result'], -5);
        assertEquals(result, null);
      });
    });

    /** 非数値文字列や undefined の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-IN-04: rawValue "abc" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('integer'), 'abc');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-IN-06: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('integer'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `number` 型の動作テスト。
   *
   * 浮動小数点・整数文字列は数値に変換してセットされることを検証する。
   * 非数値文字列はエラーになることも検証する。
   */
  describe('number 型', () => {
    /** 浮動小数点・整数文字列の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-NM-01: rawValue "3.14" → config[field] = 3.14', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('number'), '3.14');
        assertEquals(config['result'], 3.14);
        assertEquals(result, null);
      });
    });

    /** 非数値文字列や undefined の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-NM-03: rawValue "xyz" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('number'), 'xyz');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-NM-04: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('number'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `directory` 型の動作テスト。
   *
   * スラッシュを含むパスは正規化してセットされることを検証する。
   * スラッシュなしの単純文字列はエラーになることも検証する。
   */
  describe('directory 型', () => {
    /** 絶対パス・Windowsパスの正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-DR-01: rawValue "/abs/path" → config[field] = "/abs/path"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('directory'), '/abs/path');
        assertEquals(config['result'], '/abs/path');
        assertEquals(result, null);
      });

      it('[Normal] T-SBT-DR-03: rawValue "C:\\\\Windows\\\\path" → config[field] = "C:/Windows/path" (正規化)', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('directory'), 'C:\\Windows\\path');
        assertEquals(config['result'], 'C:/Windows/path');
        assertEquals(result, null);
      });
    });

    /** スラッシュなし文字列や undefined の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-DR-04: rawValue "plain" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('directory'), 'plain');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-DR-05: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('directory'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });

  /**
   * `period` 型の動作テスト。
   *
   * `YYYY-MM` または `YYYY` 形式の文字列は正常にセットされ、
   * それ以外の形式はエラーになることを検証する。
   * 月レンジ（01〜12）は `isArgPeriod` の仕様に合わせて検証しない。
   */
  describe('period 型', () => {
    /** YYYY-MM 形式・YYYY 形式の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SBT-PR-01: rawValue "2026-03" → config[field] = "2026-03"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), '2026-03');
        assertEquals(config['result'], '2026-03');
        assertEquals(result, null);
      });

      it('[Normal] T-SBT-PR-02: rawValue "2026" → config[field] = "2026"', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), '2026');
        assertEquals(config['result'], '2026');
        assertEquals(result, null);
      });
    });

    /** 不正な形式や undefined の異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-SBT-PR-03: rawValue "invalid" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), 'invalid');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });

      it('[Error] T-SBT-PR-04: rawValue undefined → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), undefined);
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });

    /** 境界値・isArgPeriod の仕様に準じたケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SBT-PR-05: rawValue "2026-13" → config に設定される（月レンジ非チェック）', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), '2026-13');
        assertEquals(config['result'], '2026-13');
        assertEquals(result, null);
      });

      it('[Edge] T-SBT-PR-06: rawValue "" → ChatlogError', () => {
        const config = _makeConfig();
        const result = _setByTypeForTest(config, _entry('period'), '');
        assertNotEquals(result, null);
        assertEquals(result instanceof ChatlogError, true);
      });
    });
  });
});
