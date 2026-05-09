#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/filter-chatlog.ts
// @(#): チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * filter_chatlog.ts — チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
 *
 * 使い方:
 *   deno run --allow-read --allow-run filter_chatlog.ts [YYYY-MM] [--dry-run] [--input DIR]
 */

// ─────────────────────────────────────────────
// import
// ─────────────────────────────────────────────

// -- constants --
import { LOGGER_HEADER } from '../../_scripts/constants/logger-header.constants.ts';

// -- external --
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-io/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { isDirectoryArg, parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';

// -- internal --
// constants
import { DEFAULT_FILTER_CONFIG } from './constants/filter.constants.ts';
// types
import type { FilterConfig, ParsedConfig } from './types/filter.types.ts';
// libs
import { findFiles } from '../../_scripts/libs/file-io/find-files.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { prefilterFiles } from './libs/prefilter.ts';
import { processChunk } from './libs/process-chunk.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** `--option value` 形式のオプションと ParsedConfig キーのマッピング。 */
const _OPT_KEYS: Record<string, keyof ParsedConfig> = {
  '--input': 'inputDir',
  '--config': 'configFile',
  '--chatlogs-dir': 'chatlogsDir',
};

/** `--flag` 形式（値なし）のオプションと ParsedConfig キーのマッピング。 */
const _OPT_FLAGS: Record<string, keyof ParsedConfig> = {
  '--dry-run': 'dryRun',
};

/**
 * コマンドライン引数を解析して ParsedConfig を返す。
 * - `--input` の値はディレクトリパス形式（`/` を含む）でなければ `ChatlogError(InvalidArgs)` をスローする。
 * - `--chatlogs-dir` の値はディレクトリパス形式（`/` を含む）でなければ `ChatlogError(InvalidArgs)` をスローする。
 * - `chatlogsDir` が未指定の場合は `inputDir` の値をフォールバックとして設定する。
 */
export const parseArgs = (args: string[]): ParsedConfig => {
  const _parsed = parseArgsToConfig<ParsedConfig>(args, _OPT_KEYS, _OPT_FLAGS) as ParsedConfig;
  if (_parsed.inputDir !== undefined && !isDirectoryArg(_parsed.inputDir)) {
    throw new ChatlogError(
      'InvalidArgs',
      `--input にはディレクトリパスを指定してください: ${_parsed.inputDir}`,
    );
  }
  if (_parsed.chatlogsDir !== undefined && !isDirectoryArg(_parsed.chatlogsDir)) {
    throw new ChatlogError(
      'InvalidArgs',
      `--chatlogs-dir にはディレクトリパスを指定してください: ${_parsed.chatlogsDir}`,
    );
  }
  return {
    ..._parsed,
    chatlogsDir: _parsed.chatlogsDir ?? _parsed.inputDir,
  };
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な FilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - chatlogsDir 優先順位: `parsed.chatlogsDir` > `globalConfig.get('chatlogsDir')`
 * - inputDir 優先順位: `parsed.inputDir` > `parsed.chatlogsDir` > `globalConfig.get('chatlogsDir')`
 * - dryRun: `parsed.dryRun` > `defaults.dryRun`（false）
 * - period: `parsed` のみ（GlobalConfig 連携なし）
 * - discardThreshold: `globalConfig.get('discardThreshold')` > `defaults.discardThreshold`
 * - `configFile` は FilterConfig に存在しないため結果に含まれない。
 */
export const buildConfig = (
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
  defaults: FilterConfig = DEFAULT_FILTER_CONFIG,
): FilterConfig => {
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _globalChatlogDir = globalConfig.get('chatlogsDir') as string;
  const _inputDir = parsed.inputDir ?? parsed.chatlogsDir ?? _globalChatlogDir;
  const _chatlogsDir = parsed.chatlogsDir ?? _globalChatlogDir;
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
    inputDir: _inputDir,
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

    const _baseDir = _globalConfig.get('chatlogsDir') as string;
    const _agentDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      baseDir: _baseDir,
      agent: _config.agent,
    });

    // 入力ディレクトリ確認
    if (!await dirExists(_agentDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${_agentDir}`);
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
