// src: scripts/config/prefilter-config.ts
// @(#): prefilter-chatlogs の引数解析・設定構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { parseArgs as parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';
// classes
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';

// ─── internal ───
// constants
import { DEFAULT_PREFILTER_CONFIG } from '../constants/common.constants.ts';
// types
import type { PrefilterConfig, PrefilterParsedConfig } from '../types/prefilter.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** prefilter-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgsSchema<PrefilterParsedConfig> = [
  { option: '--report', field: 'report', type: 'flag' },
];

export const parseArgs = (args: string[]): PrefilterParsedConfig => {
  const _parsed = parseArgsToConfig<PrefilterParsedConfig>(args, _SCHEMA);
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
 * PrefilterParsedConfig・GlobalConfig・デフォルト値から完全な PrefilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - chatlogsDir: `globalConfig.get('chatlogsDir')`（基準ディレクトリ）
 * - inputDir: `parsed.inputDir`（指定時のみ設定される。フルパス直接指定の短絡パラメータ）
 * - `configFile` は PrefilterConfig に存在しないため結果に含まれない。
 */
export const buildConfig = (
  parsed: PrefilterParsedConfig,
  globalConfig: GlobalConfig,
  defaults: PrefilterConfig = DEFAULT_PREFILTER_CONFIG,
): PrefilterConfig => {
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
