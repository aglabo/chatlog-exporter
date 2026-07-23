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
import { parseArgs } from '../../../_scripts/libs/io/parse-args.ts';

// types
import type { ArgSchema } from '../../../_scripts/types/args-schema.types.ts';

// --- internal
// types
import type { NormalizeConfig } from '../types/normalize.types.ts';

// constants
import { DEFAULT_NORMALIZE_CONFIG } from '../constants/normalize.constants.ts';

// --- local
// constants
const _SCHEMA: ArgSchema<NormalizeConfig> = [
  { option: '--agent', field: 'agent', type: 'agent' },
  { option: '--period', field: 'period', type: 'period' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
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
 */
export const buildConfig = (
  args: string[],
  defaults: Partial<NormalizeConfig> = DEFAULT_NORMALIZE_CONFIG,
): NormalizeConfig => {
  const _parsed = parseArgs<NormalizeConfig>(args, _SCHEMA, defaults);
  const { configFile: _configFile, ...rest } = _parsed;
  return rest as NormalizeConfig;
};
