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
 *   deno run --allow-read --allow-run filter-chatlogs.ts [YYYY-MM] [--dry-run] [--input-dir DIR]
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
import { parseArgs as parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
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
const _SCHEMA: ArgsSchema<FilterParsedConfig> = [];

export const parseArgs = (args: string[]): FilterParsedConfig => {
  return parseArgsToConfig<FilterParsedConfig>(args, _SCHEMA);
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * FilterParsedConfig・GlobalConfig・デフォルト値から完全な FilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - chatlogsDir: `globalConfig.get('chatlogsDir')`（基準ディレクトリ）
 * - inputDir: `parsed.inputDir`（指定時のみ設定される。フルパス直接指定の短絡パラメータ）
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
  const _chatlogsDir = globalConfig.get('chatlogsDir') as string;
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
    chatlogsDir: _chatlogsDir,
    inputDir: parsed.inputDir,
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
    const _globalConfig = GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    const _searchDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      agent: _config.agent,
      period: _config.period,
      addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
      override: _config.inputDir,
    });

    // 入力ディレクトリ確認
    if (!await dirExists(_searchDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${_searchDir}`);
    }

    logger.info(`対象 agent: ${_config.agent}`);
    if (_config.period) { logger.info(`対象期間: ${_config.period}`); }

    // ファイル列挙
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
