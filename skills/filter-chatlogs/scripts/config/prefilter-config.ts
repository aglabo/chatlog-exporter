// src: scripts/config/prefilter-config.ts
// @(#): prefilter-chatlogs の引数解析・設定構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';
import { parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
import { DEFAULT_PREFILTER_CONFIG } from '../constants/common.constants.ts';
import type { PrefilterConfig, PrefilterParsedConfig } from '../types/prefilter.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

export const buildConfig = (
  parsed: PrefilterParsedConfig,
  globalConfig: GlobalConfig,
  defaults: PrefilterConfig = DEFAULT_PREFILTER_CONFIG,
): PrefilterConfig => {
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _globalChatlogDir = globalConfig.get('chatlogsDir') as string;
  const _baseDir = parsed.baseDir ?? _globalChatlogDir;
  const _chatlogsDir = parsed.chatlogsDir ?? _baseDir;
  const { configFile: _configFile, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    agent: _agent,
    baseDir: _baseDir,
    chatlogsDir: _chatlogsDir,
  };
};

const _OPT_KEYS: Record<string, keyof PrefilterParsedConfig> = {
  '--base-dir': 'baseDir',
  '--chatlogs-dir': 'chatlogsDir',
  '--config': 'configFile',
};

const _OPT_FLAGS: Record<string, keyof PrefilterParsedConfig> = {
  '--dry-run': 'dryRun',
  '--report': 'report',
};

export const parseArgs = (args: string[]): PrefilterParsedConfig => {
  const _parsed = parseArgsToConfig<PrefilterParsedConfig>(args, _OPT_KEYS, _OPT_FLAGS) as PrefilterParsedConfig;
  _parsed.dryRun ??= (_parsed.dryRun ?? false) || (_parsed.report ?? false);
  _parsed.report ??= false;
  return {
    ..._parsed,
  };
};
