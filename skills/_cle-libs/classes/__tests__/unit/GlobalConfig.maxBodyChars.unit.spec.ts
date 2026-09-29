// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.maxBodyChars.unit.spec.ts
// @(#): GlobalConfig の maxBodyChars キー解決 ユニットテスト
//       対象: GlobalConfig / DEFAULT_CONFIG_SCHEMA / DEFAULT_CONFIG_VALUES /
//             DEFAULT_MAX_BODY_CHARS
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { GlobalConfig } from '../../GlobalConfig.class.ts';

// ─── Helpers
import { ChatlogError } from '../../ChatlogError.class.ts';
// constants
import { DEFAULT_CONFIG_SCHEMA, DEFAULT_CONFIG_VALUES } from '../../../constants/config-schema.constants.ts';
import { DEFAULT_MAX_BODY_CHARS } from '../../../constants/defaults.constants.ts';
// types
import type { ConfigFieldSchema } from '../../../types/config-schema.types.ts';

// ─── Internal Helpers

// types

/** YAML から解決した `maxBodyChars` を検証するテストケース。 */
type ResolveCase = {
  /** テスト ID（例: `T-CLS-GCM-02-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** 解決後に期待する `maxBodyChars` の値。 */
  expectedMaxBodyChars: number;
};

/** 範囲外の YAML 値が `ChatlogError(InvalidYaml/OutOfRange)` で落ちることを検証するテストケース。 */
type OutOfRangeCase = {
  /** テスト ID（例: `T-CLS-GCM-03-01`）。 */
  testId: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
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

/**
 * `DEFAULT_CONFIG_SCHEMA` から number フィールドのスキーマ定義を取り出す。
 *
 * 文字列短縮形（`'string'` / `'number'`）で登録されていた場合、および未登録キーの場合は
 * 範囲を持たないため `undefined` を返し、呼び出し側のアサーションを失敗させる。
 *
 * @param key - スキーマキー名
 * @returns 範囲付きスキーマ定義。範囲を持たない場合は `undefined`
 */
const _numberSchemaOf = (key: string): ConfigFieldSchema | undefined => {
  const _field: unknown = DEFAULT_CONFIG_SCHEMA[key];
  return typeof _field === 'object' && _field !== null ? _field as ConfigFieldSchema : undefined;
};

// cases

/** 正常系: YAML の値と既定値が解決されるケース。 */
const _resolveCases: ResolveCase[] = [
  {
    testId: 'T-CLS-GCM-02-01',
    label: 'maxBodyChars を指定すると YAML の値に解決される',
    yaml: 'maxBodyChars: 16000\n',
    expectedMaxBodyChars: 16000,
  },
  {
    testId: 'T-CLS-GCM-02-02',
    label: 'maxBodyChars を指定しないと既定値に解決される',
    yaml: 'batchSize: 4\n',
    expectedMaxBodyChars: DEFAULT_MAX_BODY_CHARS,
  },
];

/** 異常系: スキーマ範囲を外れた YAML 値のケース。 */
const _outOfRangeCases: OutOfRangeCase[] = [
  { testId: 'T-CLS-GCM-03-01', yaml: 'maxBodyChars: 0\n' },
  { testId: 'T-CLS-GCM-03-02', yaml: 'maxBodyChars: 100001\n' },
];

/** エッジケース: スキーマ範囲の境界値（両端を含む）。 */
const _boundaryCases: ResolveCase[] = [
  {
    testId: 'T-CLS-GCM-04-01',
    label: 'maxBodyChars: 1（下限）は範囲内として通る',
    yaml: 'maxBodyChars: 1\n',
    expectedMaxBodyChars: 1,
  },
  {
    testId: 'T-CLS-GCM-04-02',
    label: 'maxBodyChars: 100000（上限）は範囲内として通る',
    yaml: 'maxBodyChars: 100000\n',
    expectedMaxBodyChars: 100_000,
  },
];

// ─── Tests

/**
 * `GlobalConfig` の `maxBodyChars` キー解決に関するユニットテストスイート。
 *
 * filter-chatlogs がハードコードしている `MAX_BODY_CHARS`（= 8000）を `config.yaml` から
 * 設定可能にするため、共通定数（`defaults.constants.ts`）と設定スキーマ
 * （`config-schema.constants.ts`）の側から検証する。
 *
 * 検出対象の欠陥:
 * - `maxBodyChars` が `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` に未登録で、
 *   `config.yaml` に書くと `_assertKnownKeys` が `ChatlogError('InvalidYaml', 'UnknownKey')` を投げる
 * - 既定値が現行の `MAX_BODY_CHARS`（= 8000）と食い違い、設定化が振る舞いを変えてしまう
 *
 * 「既定値がリテラル直書きで共通定数を経由していない」（`cle-kju.10` D1）は本スイートの検出対象では
 * ない。リテラル `8000` と値 8000 の定数参照は実行時に区別できず、実際 `DEFAULT_CONFIG_VALUES` の
 * 参照をリテラルへ変異させても 8 件すべて緑のままだった。D1 はレビューで担保する。
 *
 * スキーマ範囲は `1〜100000`（上限は `maxContentLength` と揃える）。
 * `0` は無効とする（`maxBatchChars: 0` = 無制限とは意味が違う）。
 * `renderConversation(conv, 0)` が空文字列を返すため、`0` を許すと全件 DISCARD が起こりうる。
 *
 * テスト ID 範囲: T-CLS-GCM-01-01 〜 T-CLS-GCM-04-02
 *
 * @see GlobalConfig
 */
describe('GlobalConfig maxBodyChars', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * 設定スキーマと既定値の整合テスト。
   *
   * スキーマに `maxBodyChars` が範囲付き number として登録されていること、
   * その既定値が現行 `MAX_BODY_CHARS` と同じ 8000 であることを検証する。
   */
  describe('設定スキーマへの登録', () => {
    it('[Normal] T-CLS-GCM-01-01: maxBodyChars が範囲 1〜100000 の number としてスキーマに登録されている', () => {
      assertEquals(_numberSchemaOf('maxBodyChars'), { type: 'number', min: 1, max: 100_000 });
    });

    it('[Normal] T-CLS-GCM-01-02: maxBodyChars の既定値が DEFAULT_MAX_BODY_CHARS（=8000）と一致する', () => {
      assertEquals(DEFAULT_MAX_BODY_CHARS, 8000);
      assertEquals(DEFAULT_CONFIG_VALUES.maxBodyChars, DEFAULT_MAX_BODY_CHARS);
    });
  });

  /**
   * `config.yaml` 由来の値解決テスト。
   *
   * YAML 指定・既定値フォールバック・範囲外・境界値を検証する。
   * 未登録キーなら `getInstance` 時点で `ChatlogError('InvalidYaml', 'UnknownKey')` が飛ぶため、
   * 正常系の各ケースは「例外を投げないこと」の検証も兼ねる。
   */
  describe('YAML からの値解決', () => {
    describe('When: 正常系', () => {
      for (const _case of _resolveCases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          const _config = _makeConfig(_case.yaml);
          assertEquals(_config.get('maxBodyChars'), _case.expectedMaxBodyChars);
        });
      }
    });

    describe('When: 異常系', () => {
      for (const _case of _outOfRangeCases) {
        it(`[Error] ${_case.testId}: yaml "${_case.yaml.trim()}" → ChatlogError(InvalidYaml/OutOfRange)`, () => {
          const _error = assertThrows(() => _makeConfig(_case.yaml), ChatlogError);
          assertEquals([_error.kind, _error.subindex], ['InvalidYaml', 'OutOfRange']);
        });
      }
    });

    describe('When: エッジケース', () => {
      for (const _case of _boundaryCases) {
        it(`[Edge] ${_case.testId}: ${_case.label}`, () => {
          const _config = _makeConfig(_case.yaml);
          assertEquals(_config.get('maxBodyChars'), _case.expectedMaxBodyChars);
        });
      }
    });
  });
});
