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
import { ChatlogCache } from '../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
// functions
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgs } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_scripts/constants/defaults.constants.ts';
import { LOGGER_HEADER } from '../../_scripts/constants/logger-header.constants.ts';
// types
import type { ArgSchema } from '../../_scripts/types/args-schema.types.ts';

// ─── internal ───
// functions
import { countUnexecutedChunkFiles } from './modules/filter/count-unexecuted-chunk-files.ts';
import { processChunk } from './modules/filter/process-chunk.ts';
import { sweepDiscards } from './modules/filter/sweep-discards.ts';
import { prefilterFiles } from './modules/prefilter.ts';
// constants
import { DEFAULT_FILTER_CONFIG } from './constants/common.constants.ts';
import { FILTER_DECISIONS } from './types/filter-decision.const.types.ts';
// types
import type { CLEResult } from './types/cache.types.ts';
import type { FilterConfig, FilterParsedConfig } from './types/filter.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** filter-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgSchema<FilterParsedConfig> = [
  { option: '--chunk-size', field: 'chunkSize', type: 'integer' },
];

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * CLI 引数から完全な FilterConfig を構築する。
 * - `parseArgs`（共通ライブラリ）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの設定を返すため、
 *   GlobalConfig の値を個別に再取得しない。
 * - `configFile` は FilterConfig に存在しないため結果から除外する。
 */
export const buildConfig = (
  args: string[],
  defaults: FilterConfig = DEFAULT_FILTER_CONFIG,
): FilterConfig => {
  const _parsed = parseArgs<FilterParsedConfig>(args, _SCHEMA, defaults);
  const { configFile: _configFile, ...rest } = _parsed;
  return { ...rest } as FilterConfig;
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args?: string[]): Promise<void> => {
  const _config = buildConfig(args ?? Deno.args);

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

  // 判定結果キャッシュ
  const _cache = new ChatlogCache<CLEResult>('filter-cache');
  await _cache.ready;

  // 事前フィルタ
  const stats = { keep: 0, skip: 0, remove: 0, error: 0 };

  // キャッシュ済み判定が KEEP かどうかを判定する
  const _isCachedKeep = (filePath: string): boolean => _cache.read(filePath).decision === FILTER_DECISIONS.KEEP;

  // キャッシュ済み判定が DISCARD とマークされているかどうかを判定する
  const _isCachedDiscard = (filePath: string): boolean => _cache.read(filePath).decision === FILTER_DECISIONS.DISCARD;

  // キャッシュ上 KEEP 済み・DISCARD マーク済みのファイルを処理対象から除外する
  const _targetEntries = allFiles.filter((filePath) => !_isCachedKeep(filePath) && !_isCachedDiscard(filePath));

  // キャッシュ済み KEEP 件数を集計
  stats.keep += allFiles.filter(_isCachedKeep).length;

  // 全体数・判定候補数（キャッシュ除外後）を集計ログとして出力する
  logger.info(`対象集計: total=${allFiles.length} candidates=${_targetEntries.length}`);

  const targetFiles = await prefilterFiles(_targetEntries, {
    minCharCount: _config.minCharCount,
    minAssistantChars: _config.minAssistantChars,
    stats,
    dryRun: _config.dryRun,
  });

  const total = targetFiles.length;
  if (total === 0) {
    logger.info(`${LOGGER_HEADER.NO_FILE_FOUND}: 対象ファイルなし`);
  } else {
    logger.info(`判定対象ファイル数: ${total}`);

    if (_config.dryRun) {
      logger.info('dry-run モード: claude CLI を呼び出さず対象ファイルを一覧表示します');
      targetFiles.forEach((filePath) => logger.info(`対象: ${filePath}`));
      stats.skip += targetFiles.length;
      logger.info('判定済み: judged=0（dry-run）');
    } else {
      // チャンク分割して並列処理（判定結果はキャッシュに書き込むのみ。削除は後続のスイープで行う）
      const chunkResults = await runChunked(
        targetFiles,
        _config.chunkSize,
        (chunk, ctl) => processChunk(chunk, stats, _config.discardThreshold, _cache, ctl),
        _config.concurrency,
      );

      // レートリミット等で abort された後、未着手のまま残ったチャンクのファイル数を skip に計上する
      const unexecutedFileCount = countUnexecutedChunkFiles(targetFiles, _config.chunkSize, chunkResults);
      if (unexecutedFileCount > 0) {
        stats.skip += unexecutedFileCount;
        logger.warn(
          `レートリミットのため ${unexecutedFileCount} 件のチャンク未実行ファイルの実行を取りやめました（次回再判定対象）`,
        );
      }

      logger.info(`判定済み: judged=${targetFiles.length - unexecutedFileCount}`);
    }
  }

  // DISCARD マーク済み（今回マーク分 + 前回削除されずに残ったゾンビファイル）をまとめて削除する
  await sweepDiscards(allFiles, _cache, stats, _config.dryRun);

  // サマリー
  const drySuffix = _config.dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${drySuffix}: total=${allFiles.length} keep=${stats.keep} skip=${stats.skip} remove=${stats.remove} error=${stats.error}`,
  );
};

// --- main routine ---
if (import.meta.main) {
  try {
    await main(Deno.args);
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
}
