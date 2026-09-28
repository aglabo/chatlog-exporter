// src: skills/normalize-chatlogs/scripts/modules/normalize-config.ts
// @(#): parseArgs と buildConfig の実装モジュール
//       対象: parseArgs, buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// functions
import { parseArgs } from '../../../_cle-libs/libs/io/parse-args.ts';

// types
import type { ArgSchema } from '../../../_cle-libs/types/args-schema.types.ts';

// --- internal
// types
import type { NormalizeConfig } from '../types/normalize.types.ts';

// constants
import { DEFAULT_NORMALIZE_CONFIG } from '../constants/normalize.constants.ts';

// --- local
// constants
/**
 * `buildConfig` が受け付ける CLI オプションのスキーマ。
 *
 * `batchSize` / `maxBatchChars` は CLI 側でも範囲検査する。`min` / `max` は
 * `DEFAULT_CONFIG_SCHEMA`（`_cle-libs/constants/config-schema.constants.ts`）の同名フィールドと
 * 一致させる。`maxBatchChars` の `min` は 0（`0 = 無制限` の明示指定を弾かない）。
 *
 * CLI 側に範囲検査が必要な理由: `GlobalConfig._assertInRange` は `parseYaml` 経由でしか走らず、
 * **CLI の値を見ない**。CLI 側に `min` / `max` が無いと、範囲外の値が無検査で通る。
 *
 * `--concurrency` / `--timeout-ms` はまだ `min` / `max` を持たない。別 issue `cle-kju.11` で扱う。
 */
const _SCHEMA: ArgSchema<NormalizeConfig> = [
  { option: '--agent', field: 'agent', type: 'agent' },
  { option: '--period', field: 'period', type: 'period' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
  { option: '--batch-size', field: 'batchSize', type: 'integer', min: 1, max: 10 },
  { option: '--max-batch-chars', field: 'maxBatchChars', type: 'integer', min: 0, max: 1000000 },
  { option: '--timeout-ms', field: 'timeoutMs', type: 'integer' },
  { option: '--output-dir', field: 'outputDir', type: 'directory' },
  { option: '--fail-fast', field: 'failFast', type: 'flag' },
  { option: '--single-file', field: 'singleFile', type: 'flag' },
];

/**
 * CLI 引数から完全な NormalizeConfig を構築する。
 * - `parseArgsToConfig`（共通ライブラリの `parseArgs`）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの設定を返すため、
 *   GlobalConfig の値を個別に再取得しない。
 * - `dryRun` は `DEFAULT_NORMALIZE_CONFIG` により未指定時 `false` になる。
 * - `batchSize`（`--batch-size`）と `maxBatchChars`（`--max-batch-chars`）はセグメント分割の
 *   二重上限で、いずれも「CLI > config.yaml > `DEFAULT_CONFIG_VALUES`」の順で解決される。
 *   `maxBatchChars: 0` は無制限を意味する。
 * - **`DEFAULT_NORMALIZE_CONFIG` が実効値になるのは `dryRun` だけ。** `GlobalConfig.values()` は
 *   常に `DEFAULT_CONFIG_VALUES` の全キーを埋めて返すため、`DEFAULT_CONFIG_SCHEMA` に同名キーを持つ
 *   `concurrency` / `batchSize` / `maxBatchChars` では第 3 層が発火しない。
 *   これらの既定値を変えるときは `DEFAULT_CONFIG_VALUES` 側を編集する
 *   （`DEFAULT_NORMALIZE_CONFIG` だけ編集しても黙って無効になる）。
 * - `concurrency` はさらに注意が必要。`DEFAULT_CONFIG_VALUES` の `batchSize` / `maxBatchChars` は
 *   共有定数 `DEFAULT_BATCH_SIZE` / `DEFAULT_MAX_BATCH_CHARS` を経由するが、`concurrency` だけは
 *   リテラル `4` で `DEFAULT_CONCURRENCY` を経由しない。したがって `DEFAULT_CONCURRENCY` を書き換えても
 *   normalize の実効値は変わらない（変えるなら `DEFAULT_CONFIG_VALUES.concurrency` を直す）。
 */
export const buildConfig = (
  args: string[],
  defaults: Partial<NormalizeConfig> = DEFAULT_NORMALIZE_CONFIG,
): NormalizeConfig => {
  const _parsed = parseArgs<NormalizeConfig>(args, _SCHEMA, defaults);
  const { configFile: _configFile, ...rest } = _parsed;
  return rest as NormalizeConfig;
};
