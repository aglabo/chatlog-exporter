// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.overrides.unit.spec.ts
// @(#): GlobalConfig.getInstance の overrides オプション（CLI 値の上書き） ユニットテスト
//       対象: GlobalConfig.getInstance
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStrictEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Internal Helpers

// types
import type { ConfigValues } from '../../../types/config-schema.types.ts';

/** yaml + overrides の解決結果を検証するテストケース。 */
type _OverridesCase = {
  /** テスト ID（例: `T-CLS-GCO-01-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** `GlobalConfig.getInstance({ overrides })` に渡す上書き値。 */
  overrides: Partial<ConfigValues>;
  /** 解決後に期待する `debug` の値。 */
  expected: boolean;
};

// ─── Tests

/**
 * `GlobalConfig.getInstance` の `overrides` オプションに関するユニットテストスイート。
 *
 * overrides が yaml / 設定ファイル / 既定値より優先されること、
 * `undefined` 値のキーが読み込み値を潰さないこと、
 * 既存インスタンスがあれば overrides が無視されることを検証する。
 *
 * @see GlobalConfig.getInstance
 */
describe('GlobalConfig overrides', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  describe('Given: yaml 指定で getInstance を呼ぶ', () => {
    /** overrides が yaml 値・既定値に勝つ正常ケース。 */
    describe('When: overrides に値を指定する', () => {
      const _cases: _OverridesCase[] = [
        {
          testId: 'T-CLS-GCO-01-01',
          label: 'yaml debug: false + overrides { debug: true } → true',
          yaml: 'debug: false\n',
          overrides: { debug: true },
          expected: true,
        },
        {
          testId: 'T-CLS-GCO-01-02',
          label: 'yaml debug: true + overrides { debug: false } → false',
          yaml: 'debug: true\n',
          overrides: { debug: false },
          expected: false,
        },
        {
          testId: 'T-CLS-GCO-01-03',
          label: 'yaml に debug なし + overrides { debug: true } → true（既定値より優先）',
          yaml: 'agent: claude\n',
          overrides: { debug: true },
          expected: true,
        },
      ];

      for (const _case of _cases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          const _config = GlobalConfig.getInstance({ yaml: _case.yaml, overrides: _case.overrides });
          assertStrictEquals(_config.get('debug'), _case.expected);
        });
      }
    });

    /** undefined 値のキーは読み込み値を潰さないケース。 */
    describe('When: overrides のキーが undefined', () => {
      it('[Edge] T-CLS-GCO-03-01: yaml debug: true + overrides { debug: undefined } → true のまま', () => {
        const _config = GlobalConfig.getInstance({ yaml: 'debug: true\n', overrides: { debug: undefined } });
        assertStrictEquals(_config.get('debug'), true);
      });
    });
  });

  describe('Given: configFile 指定で getInstance を呼ぶ', () => {
    describe('When: overrides に値を指定する', () => {
      it('[Normal] T-CLS-GCO-01-04: ファイル debug: false + overrides { debug: true } → true', () => {
        const _readPaths: string[] = [];
        const _config = GlobalConfig.getInstance({
          configFile: 'test-config.yaml',
          readTextFileProvider: (path: string) => {
            _readPaths.push(path);
            return 'debug: false\n';
          },
          overrides: { debug: true },
        });
        assertEquals(_readPaths.length, 1);
        assertStrictEquals(_config.get('debug'), true);
      });
    });
  });

  describe('Given: インスタンスが既に存在する', () => {
    describe('When: 異なる overrides で getInstance を再度呼ぶ', () => {
      it('[Edge] T-CLS-GCO-03-02: 2 回目の overrides は無視され最初の値が保持される', () => {
        const _first = GlobalConfig.getInstance({ yaml: 'debug: false\n', overrides: { debug: true } });
        const _second = GlobalConfig.getInstance({ yaml: 'debug: false\n', overrides: { debug: false } });
        assertStrictEquals(_second, _first);
        assertStrictEquals(_second.get('debug'), true);
      });
    });
  });
});
