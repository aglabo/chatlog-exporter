// src: scripts/config/noise-filter-config.ts
// @(#): noise-filter-chatlogs の引数解析・設定構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { parseArgs as parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
// types
import type { ArgSchema } from '../../../_scripts/types/args-schema.types.ts';
// classes
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';

// ─── internal ───
// constants
import { DEFAULT_NOISE_FILTER_CONFIG } from '../constants/common.constants.ts';
// types
import type { NoiseFilterConfig, NoiseFilterParsedConfig } from '../types/noise-filter.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** noise-filter-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgSchema<NoiseFilterParsedConfig> = [
  { option: '--report', field: 'report', type: 'flag' },
];

export const parseArgs = (args: string[]): NoiseFilterParsedConfig => {
  const _parsed = parseArgsToConfig<NoiseFilterParsedConfig>(args, _SCHEMA);
  _parsed.dryRun ??= (_parsed.dryRun ?? false) || (_parsed.report ?? false);
  _parsed.report ??= false;
  return {
    ..._parsed,
  };
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * NoiseFilterParsedConfig・GlobalConfig・デフォルト値から完全な NoiseFilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - chatlogsDir: `globalConfig.get('chatlogsDir')`（基準ディレクトリ）
 * - inputDir: `parsed.inputDir`（指定時のみ設定される。フルパス直接指定の短絡パラメータ）
 * - `configFile` は NoiseFilterConfig に存在しないため結果に含まれない。
 */
export const buildConfig = (
  parsed: NoiseFilterParsedConfig,
  globalConfig: GlobalConfig,
  defaults: NoiseFilterConfig = DEFAULT_NOISE_FILTER_CONFIG,
): NoiseFilterConfig => {
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _chatlogsDir = globalConfig.get('chatlogsDir') as string;
  const { configFile: _configFile, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    agent: _agent,
    chatlogsDir: _chatlogsDir,
    inputDir: parsed.inputDir,
  };
};
