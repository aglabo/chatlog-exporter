// src: scripts/config/noise-filter-config.ts
// @(#): noise-filter-chatlogs の引数解析・設定構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { parseArgs } from '../../../_scripts/libs/io/parse-args.ts';
// types
import type { ArgSchema } from '../../../_scripts/types/args-schema.types.ts';

// ─── internal ───
// constants
import { DEFAULT_NOISE_FILTER_CONFIG } from '../constants/common.constants.ts';
// types
import type { NoiseFilterConfig, NoiseFilterParsedConfig } from '../types/noise-filter.types.ts';

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/** noise-filter-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgSchema<NoiseFilterParsedConfig> = [];

/**
 * CLI 引数から完全な NoiseFilterConfig を構築する。
 * - `parseArgsToConfig`（共通ライブラリの `parseArgs`）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの設定を返すため、
 *   GlobalConfig の値を個別に再取得しない。
 * - `dryRun` は未指定時 `false` になる。
 * - `configFile` は NoiseFilterConfig に存在しないため結果から除外する。
 */
export const buildConfig = (
  args: string[],
  defaults: NoiseFilterConfig = DEFAULT_NOISE_FILTER_CONFIG,
): NoiseFilterConfig => {
  const _parsed = parseArgs<NoiseFilterParsedConfig>(args, _SCHEMA, defaults);
  _parsed.dryRun ??= false;
  const { configFile: _configFile, ...rest } = _parsed;
  return { ...rest } as NoiseFilterConfig;
};
