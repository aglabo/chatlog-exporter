// src: skills/_cle-libs/classes/__tests__/unit/GlobalConfig.batchLimits.unit.spec.ts
// @(#): GlobalConfig の batchSize / maxBatchChars キー解決 ユニットテスト
//       対象: GlobalConfig / DEFAULT_CONFIG_SCHEMA / DEFAULT_CONFIG_VALUES /
//             DEFAULT_BATCH_SIZE / DEFAULT_MAX_BATCH_CHARS
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
import { DEFAULT_BATCH_SIZE, DEFAULT_MAX_BATCH_CHARS } from '../../../constants/defaults.constants.ts';
// types
import type { ConfigFieldSchema } from '../../../types/config-schema.types.ts';

// ─── Internal Helpers

// types

/** YAML から解決した設定値を検証するテストケース。 */
type ResolveCase = {
  /** テスト ID（例: `T-CLS-GCB-03-01`）。 */
  testId: string;
  /** `it` ラベルに載せる説明。 */
  label: string;
  /** `GlobalConfig.getInstance({ yaml })` に渡す YAML テキスト。 */
  yaml: string;
  /** 解決後に期待する `batchSize` の値。 */
  expectedBatchSize: number;
  /** 解決後に期待する `maxBatchChars` の値。 */
  expectedMaxBatchChars: number;
};

/** 範囲外の YAML 値が `ChatlogError(InvalidYaml/OutOfRange)` で落ちることを検証するテストケース。 */
type OutOfRangeCase = {
  /** テスト ID（例: `T-CLS-GCB-05-01`）。 */
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
 * 文字列短縮形（`'string'` / `'number'`）で登録されていた場合は範囲を持たないため
 * `undefined` を返し、呼び出し側のアサーションを失敗させる。
 *
 * @param key - スキーマキー名
 * @returns 範囲付きスキーマ定義。範囲を持たない場合は `undefined`
 */
const _numberSchemaOf = (key: string): ConfigFieldSchema | undefined => {
  const _field: unknown = DEFAULT_CONFIG_SCHEMA[key];
  return typeof _field === 'object' && _field !== null ? _field as ConfigFieldSchema : undefined;
};

// cases

/** 正常系: YAML の値と既定値が混在して解決されるケース。 */
const _resolveCases: ResolveCase[] = [
  {
    testId: 'T-CLS-GCB-03-01',
    label: 'batchSize と maxBatchChars を同時指定すると両方 YAML の値に解決される',
    yaml: 'batchSize: 8\nmaxBatchChars: 30000\n',
    expectedBatchSize: 8,
    expectedMaxBatchChars: 30000,
  },
  {
    testId: 'T-CLS-GCB-04-01',
    label: 'batchSize のみ指定すると maxBatchChars は既定値に解決される',
    yaml: 'batchSize: 8\n',
    expectedBatchSize: 8,
    expectedMaxBatchChars: 20000,
  },
  {
    testId: 'T-CLS-GCB-04-02',
    label: 'maxBatchChars のみ指定すると batchSize は既定値に解決される',
    yaml: 'maxBatchChars: 30000\n',
    expectedBatchSize: 4,
    expectedMaxBatchChars: 30000,
  },
];

/** 異常系: スキーマ範囲を外れた YAML 値のケース。 */
const _outOfRangeCases: OutOfRangeCase[] = [
  { testId: 'T-CLS-GCB-05-01', yaml: 'batchSize: 0\n' },
  { testId: 'T-CLS-GCB-05-02', yaml: 'batchSize: 11\n' },
  { testId: 'T-CLS-GCB-05-03', yaml: 'maxBatchChars: -1\n' },
  { testId: 'T-CLS-GCB-05-04', yaml: 'maxBatchChars: 1000001\n' },
];

/** エッジケース: スキーマ範囲の境界値（両端を含む）。 */
const _boundaryCases: ResolveCase[] = [
  {
    testId: 'T-CLS-GCB-06-01',
    label: 'maxBatchChars: 0（無制限）は範囲内として通る',
    yaml: 'maxBatchChars: 0\n',
    expectedBatchSize: 4,
    expectedMaxBatchChars: 0,
  },
  {
    testId: 'T-CLS-GCB-06-02',
    label: 'batchSize: 1（下限）は範囲内として通る',
    yaml: 'batchSize: 1\n',
    expectedBatchSize: 1,
    expectedMaxBatchChars: 20000,
  },
  {
    testId: 'T-CLS-GCB-06-03',
    label: 'batchSize: 10（上限）は範囲内として通る',
    yaml: 'batchSize: 10\n',
    expectedBatchSize: 10,
    expectedMaxBatchChars: 20000,
  },
  {
    testId: 'T-CLS-GCB-06-04',
    label: 'maxBatchChars: 1000000（上限）は範囲内として通る',
    yaml: 'maxBatchChars: 1000000\n',
    expectedBatchSize: 4,
    expectedMaxBatchChars: 1_000_000,
  },
];

// ─── Tests

/**
 * `GlobalConfig` の `batchSize` / `maxBatchChars` キー解決に関するユニットテストスイート。
 *
 * PR #480 が normalize-chatlogs へ追加した二重バッチ上限を、共通定数（`defaults.constants.ts`）と
 * 設定スキーマ（`config-schema.constants.ts`）の側から検証する。
 *
 * 検出対象の欠陥:
 * - `DEFAULT_BATCH_SIZE` / `DEFAULT_MAX_BATCH_CHARS` が `defaults.constants.ts` に未定義
 * - `batchSize` / `maxBatchChars` が `DEFAULT_CONFIG_SCHEMA` / `DEFAULT_CONFIG_VALUES` に未登録で、
 *   `config.yaml` に書くと `_assertKnownKeys` が `ChatlogError('InvalidYaml', 'UnknownKey')` を投げる
 *
 * スキーマ範囲は `batchSize: 1〜10` / `maxBatchChars: 0〜1000000`（0 = 無制限）で確定。
 * 後者の境界は `normalize-config.unit.spec.ts` の `T-NC-BC-18-03` / `T-NC-BC-19-02` が
 * `buildConfig` 経由で固定しており、本スイートはスキーマ定義そのものを固定する。
 *
 * テスト ID 範囲: T-CLS-GCB-01-01 〜 T-CLS-GCB-06-04
 *
 * @see GlobalConfig
 */
describe('GlobalConfig batchSize / maxBatchChars', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * 共通定数と設定スキーマの整合テスト。
   *
   * 共通定数が export されていること、スキーマに両キーが登録されていること、
   * スキーマ既定値が共通定数と一致していることを検証する。
   */
  describe('設定スキーマへの登録', () => {
    it('[Normal] T-CLS-GCB-01-01: batchSize が範囲 1〜10 の number としてスキーマに登録されている', () => {
      assertEquals(_numberSchemaOf('batchSize'), { type: 'number', min: 1, max: 10 });
    });

    it('[Normal] T-CLS-GCB-01-02: maxBatchChars が範囲 0〜1000000 の number としてスキーマに登録されている', () => {
      assertEquals(_numberSchemaOf('maxBatchChars'), { type: 'number', min: 0, max: 1_000_000 });
    });

    it('[Normal] T-CLS-GCB-02-01: batchSize の既定値が DEFAULT_BATCH_SIZE（=4）と一致する', () => {
      assertEquals(DEFAULT_BATCH_SIZE, 4);
      assertEquals(DEFAULT_CONFIG_VALUES.batchSize, DEFAULT_BATCH_SIZE);
    });

    it('[Normal] T-CLS-GCB-02-02: maxBatchChars の既定値が DEFAULT_MAX_BATCH_CHARS（=20000）と一致する', () => {
      assertEquals(DEFAULT_MAX_BATCH_CHARS, 20000);
      assertEquals(DEFAULT_CONFIG_VALUES.maxBatchChars, DEFAULT_MAX_BATCH_CHARS);
    });
  });

  /**
   * `config.yaml` 由来の値解決テスト。
   *
   * 両キーの同時指定・片側指定・範囲外・境界値を検証する。
   * 未登録キーなら `getInstance` 時点で `ChatlogError('InvalidYaml', 'UnknownKey')` が飛ぶため、
   * 正常系の各ケースは「例外を投げないこと」の検証も兼ねる。
   */
  describe('YAML からの値解決', () => {
    describe('When: 正常系', () => {
      for (const _case of _resolveCases) {
        it(`[Normal] ${_case.testId}: ${_case.label}`, () => {
          const _config = _makeConfig(_case.yaml);
          assertEquals(_config.get('batchSize'), _case.expectedBatchSize);
          assertEquals(_config.get('maxBatchChars'), _case.expectedMaxBatchChars);
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
          assertEquals(_config.get('batchSize'), _case.expectedBatchSize);
          assertEquals(_config.get('maxBatchChars'), _case.expectedMaxBatchChars);
        });
      }
    });
  });
});
