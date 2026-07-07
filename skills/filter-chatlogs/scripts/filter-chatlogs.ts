#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/filter-chatlogs.ts
// @(#): チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * filter-chatlogs.ts — チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
 *
 * 使い方:
 *   deno run --allow-read --allow-run filter-chatlogs.ts [YYYY-MM] [--dry-run] [--base-dir DIR]
 */

// ─────────────────────────────────────────────
// import
// ─────────────────────────────────────────────

// ─── shared ───
// classes
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
// functions
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
import { joinPath } from '../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_scripts/constants/defaults.constants.ts';
import { LOGGER_HEADER } from '../../_scripts/constants/logger-header.constants.ts';
// types
import type { ArgsSchema } from '../../_scripts/types/args-schema.types.ts';

// ─── internal ───
// functions
import { prefilterFiles } from './libs/prefilter.ts';
import { processChunk } from './modules/filter/process-chunk.ts';
// constants
import { DEFAULT_FILTER_CONFIG } from './constants/common.constants.ts';
// types
import type { FilterConfig, FilterParsedConfig } from './types/filter.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** filter-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgsSchema = [];

export const parseArgs = (args: string[]): FilterParsedConfig => {
  return parseArgsToConfig<FilterParsedConfig>(args, _SCHEMA) as FilterParsedConfig;
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * FilterParsedConfig・GlobalConfig・デフォルト値から完全な FilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - baseDir 優先順位: `parsed.baseDir` > `joinPath(globalConfig.get('chatlogsDir'), DEFAULT_ORIGINAL_LOGS_DIR)`
 * - chatlogsDir 優先順位: `parsed.chatlogsDir`（直接指定のみ、未指定なら `undefined`）
 * - dryRun: `parsed.dryRun` > `defaults.dryRun`（false）
 * - period: `parsed` のみ（GlobalConfig 連携なし）
 * - discardThreshold: `globalConfig.get('discardThreshold')` > `defaults.discardThreshold`
 * - `configFile` は FilterConfig に存在しないため結果に含まれない。
 */
export const buildConfig = (
  parsed: FilterParsedConfig,
  globalConfig: GlobalConfig,
  defaults: FilterConfig = DEFAULT_FILTER_CONFIG,
): FilterConfig => {
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _globalChatlogDir = globalConfig.get('chatlogsDir') as string;
  const _baseDir = parsed.baseDir ?? joinPath(_globalChatlogDir, DEFAULT_ORIGINAL_LOGS_DIR);
  const _chatlogsDir = parsed.chatlogsDir;
  const _chunkSize = parsed.chunkSize ?? globalConfig.get('chunkSize') as number;
  const _concurrency = parsed.concurrency ?? globalConfig.get('concurrency') as number;
  const _minCharCount = parsed.minCharCount ?? globalConfig.get('minCharCount') as number;
  const _minAssistantChars = parsed.minAssistantChars ?? globalConfig.get('minAssistantChars') as number;
  const _discardThreshold = globalConfig.get('discardThreshold') as number;
  const { configFile: _cf, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    agent: _agent,
    baseDir: _baseDir,
    chatlogsDir: _chatlogsDir,
    chunkSize: _chunkSize,
    concurrency: _concurrency,
    minCharCount: _minCharCount,
    minAssistantChars: _minAssistantChars,
    discardThreshold: _discardThreshold,
  };
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args?: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(args ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    const _baseDir = _config.baseDir ?? _globalConfig.get('chatlogsDir') as string;
    const _agentDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      baseDir: _baseDir,
      agent: _config.agent,
      period: _config.period,
    });

    // 入力ディレクトリ確認
    if (!await dirExists(_agentDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${_agentDir}`);
    }

    logger.info(`対象 agent: ${_config.agent}`);
    if (_config.period) { logger.info(`対象期間: ${_config.period}`); }

    // ファイル列挙
    const _searchDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      baseDir: _baseDir,
      agent: _config.agent,
      period: _config.period,
    });
    const allFiles = await findFiles(_searchDir);

    // 事前フィルタ
    const stats = { kept: 0, discarded: 0, skipped: 0, preSkipped: 0, error: 0 };
    const targetFiles = await prefilterFiles(allFiles, _config.minCharCount, _config.minAssistantChars, stats);

    const total = targetFiles.length;
    if (total === 0) {
      logger.info(`${LOGGER_HEADER.NO_FILE_FOUND}: 対象ファイルなし`);
      logger.info(`完了: total=${allFiles.length} preSkipped=${stats.preSkipped} kept=0 discarded=0 skipped=0 error=0`);
      return;
    }

    logger.info(`判定対象ファイル数: ${total}`);
    if (_config.dryRun) { logger.info('dry-run モード: ファイルは削除しません'); }

    // チャンク分割して並列処理
    await runChunked(
      targetFiles,
      _config.chunkSize,
      (chunk) => processChunk(chunk, _config.dryRun, stats, _config.discardThreshold),
      _config.concurrency,
    );

    // サマリー
    const drySuffix = _config.dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: total=${allFiles.length} preSkipped=${stats.preSkipped} kept=${stats.kept} discarded=${stats.discarded} skipped=${stats.skipped} error=${stats.error}`,
    );
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) {
  await main();
}
