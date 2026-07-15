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
import { parseArgs as parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
import { getProjectRoot } from '../../../_scripts/libs/path-utils/dir-utils.ts';
import { isAbsolutePath, joinPath } from '../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import {
  DEFAULT_AGENT,
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_MAX_RETRY,
} from '../../../_scripts/constants/defaults.constants.ts';
// types
import type { ArgSchema } from '../../../_scripts/types/args-schema.types.ts';

// ─── Local
// types
import type { ParsedConfig, SetfmConfig } from '../types/args.types.ts';

/** set-frontmatter の引数スキーマ。 */
const _SCHEMA: ArgSchema<ParsedConfig> = [
  { option: '--dics', field: 'dicsDir', type: 'directory' },
  { option: '--prompts', field: 'promptsDir', type: 'directory' },
  { option: '--review', field: 'review', type: 'flag' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
  { option: '--cache-dir', field: 'cacheDir', type: 'string' },
];

export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig<ParsedConfig>(args, _SCHEMA);
};

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な SetfmConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `DEFAULT_AGENT`
 * - period: `parsed.period`（そのまま、未指定なら全期間対象）
 * - chatlogsDir 優先順位: `globalConfig.get('chatlogsDir')` > `DEFAULT_CHATLOGS_DIR`
 * - inputDir: `parsed.inputDir` をそのまま通す（実際のディレクトリ解決は main() が `resolveChatlogsDir` で行う）
 * - outputDir: 絶対パスならそのまま使用、相対パスなら `join(chatlogsDir, outputDir)`、未指定なら `join(chatlogsDir, 'outputLogs')`
 * - dicsDir 優先順位: `parsed.dicsDir` > `globalConfig.get('dicsDir')` > `'dics'`。
 *   相対パスは `globalConfig.configDir` 基準の絶対パスに解決する。
 * - promptsDir 優先順位: `parsed.promptsDir` > `globalConfig.get('promptsDir')` > `'prompts'`。
 *   相対パスは `globalConfig.configDir` 基準の絶対パスに解決する。
 * - dryRun: `parsed.dryRun ?? false`
 * - review: `parsed.review ?? true` — デフォルト true
 * - concurrency: `globalConfig.get('concurrency') as number`
 */
export const buildConfig = (
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
): SetfmConfig => {
  const _chatlogsDir = (globalConfig.get('chatlogsDir') as string | undefined) ?? DEFAULT_CHATLOGS_DIR;
  const _agent = parsed.agent ?? (globalConfig.get('agent') as string | undefined) ?? DEFAULT_AGENT;
  const _outputDir = parsed.outputDir
    ? (isAbsolutePath(parsed.outputDir) ? parsed.outputDir : joinPath(_chatlogsDir, parsed.outputDir))
    : joinPath(_chatlogsDir, 'outputLogs');
  const _configBaseDir = joinPath(getProjectRoot(), globalConfig.configDir);
  const _rawDicsDir = parsed.dicsDir ?? (globalConfig.get('dicsDir') as string | undefined) ?? 'dics';
  const _dicsDir = isAbsolutePath(_rawDicsDir) ? _rawDicsDir : joinPath(_configBaseDir, _rawDicsDir);
  const _rawPromptsDir = parsed.promptsDir ?? (globalConfig.get('promptsDir') as string | undefined) ?? 'prompts';
  const _promptsDir = isAbsolutePath(_rawPromptsDir) ? _rawPromptsDir : joinPath(_configBaseDir, _rawPromptsDir);
  const _dryRun = parsed.dryRun ?? false;
  const _review = parsed.review ?? true;
  const _rawConcurrency = parsed.concurrency ?? (globalConfig.get('concurrency') as number);
  const _concurrency = Math.floor(_rawConcurrency);
  if (_concurrency < 1) {
    throw new ChatlogError('InvalidArgs', `--concurrency は 1 以上の整数を指定してください: ${_rawConcurrency}`);
  }
  const _cacheDir = parsed.cacheDir ?? joinPath(Deno.env.get('TEMP') ?? '.', 'setfm-cache');
  const _maxRetry = (globalConfig.get('maxRetry') as number) ?? DEFAULT_MAX_RETRY;
  return {
    inputDir: parsed.inputDir ?? '',
    outputDir: _outputDir,
    agent: _agent,
    period: parsed.period,
    chatlogsDir: _chatlogsDir,
    dicsDir: _dicsDir,
    promptsDir: _promptsDir,
    dryRun: _dryRun,
    review: _review,
    concurrency: _concurrency,
    cacheDir: _cacheDir,
    maxRetry: _maxRetry,
  };
};
