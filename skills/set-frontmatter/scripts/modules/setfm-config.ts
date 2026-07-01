// src: scripts/modules/setfm-config.ts
// @(#): set-frontmatter 引数解析・設定構築モジュール
//       対象: parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';
import { parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
import { isAbsolutePath, joinPath } from '../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import {
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_DICS_DIR,
  DEFAULT_PROMPTS_DIR,
} from '../../../_scripts/constants/defaults.constants.ts';
// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';

// ─── Local
// types
import type { ParsedConfig, SetfmConfig } from '../types/args.types.ts';

/** set-frontmatter の引数スキーマ。 */
const _SCHEMA: ArgsSchema = [
  { option: '--input-dir', field: 'inputDir', type: 'directory' },
  { option: '--output-dir', field: 'outputDir', type: 'directory' },
  { option: '--dics', field: 'dicsDir', type: 'directory' },
  { option: '--prompts', field: 'promptsDir', type: 'directory' },
  { option: '--dry-run', field: 'dryRun', type: 'flag' },
  { option: '--review', field: 'review', type: 'flag' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
  { option: '--cache-dir', field: 'cacheDir', type: 'string' },
  { option: '--config', field: 'configFile', type: 'string' },
];

export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig(args, _SCHEMA) as unknown as ParsedConfig;
};

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な SetfmConfig を構築する。
 * - inputDir 優先順位: `parsed.inputDir` > `join(chatlogsDir, 'normalizelogs')`
 * - outputDir: 絶対パスならそのまま使用、相対パスなら `join(chatlogsDir, outputDir)`、未指定なら `join(chatlogsDir, 'outputLogs')`
 * - chatlogsDir: `globalConfig.get('chatlogsDir')` > `DEFAULT_CHATLOGS_DIR`
 * - dicsDir 優先順位: `parsed.dicsDir` > `globalConfig.get('dicsDir')` > `DEFAULT_DICS_DIR`
 * - promptsDir 優先順位: `parsed.promptsDir` > `globalConfig.get('promptsDir')` > `DEFAULT_PROMPTS_DIR`
 * - dryRun: `parsed.dryRun ?? false`
 * - review: `parsed.review ?? true` — デフォルト true
 * - concurrency: `globalConfig.get('concurrency') as number`
 */
export const buildConfig = (
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
): SetfmConfig => {
  const _chatlogsDir = (globalConfig.get('chatlogsDir') as string | undefined) ?? DEFAULT_CHATLOGS_DIR;
  const _inputDir = parsed.inputDir || joinPath(_chatlogsDir, 'normalizelogs');
  const _outputDir = parsed.outputDir
    ? (isAbsolutePath(parsed.outputDir) ? parsed.outputDir : joinPath(_chatlogsDir, parsed.outputDir))
    : joinPath(_chatlogsDir, 'outputLogs');
  const _dicsDir = parsed.dicsDir ?? (globalConfig.get('dicsDir') as string | undefined) ?? DEFAULT_DICS_DIR;
  const _promptsDir = parsed.promptsDir ?? (globalConfig.get('promptsDir') as string | undefined)
    ?? DEFAULT_PROMPTS_DIR;
  const _dryRun = parsed.dryRun ?? false;
  const _review = parsed.review ?? true;
  const _rawConcurrency = parsed.concurrency ?? (globalConfig.get('concurrency') as number);
  const _concurrency = Math.floor(_rawConcurrency);
  if (_concurrency < 1) {
    throw new ChatlogError('InvalidArgs', `--concurrency は 1 以上の整数を指定してください: ${_rawConcurrency}`);
  }
  const _cacheDir = parsed.cacheDir ?? joinPath(Deno.env.get('TEMP') ?? '.', 'setfm-cache');
  return {
    inputDir: _inputDir,
    outputDir: _outputDir,
    dicsDir: _dicsDir,
    promptsDir: _promptsDir,
    dryRun: _dryRun,
    review: _review,
    concurrency: _concurrency,
    cacheDir: _cacheDir,
  };
};
