#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/classify-chatlogs.ts
// @(#): classify-chatlogs オーケストレーション — チャットログをプロジェクト別サブディレクトリに分類する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * classify-chatlogs.ts — チャットログをプロジェクト別サブディレクトリに分類する
 *
 * 使い方:
 *   deno run --allow-read --allow-run --allow-write classify-chatlogs.ts \
 *     [agent] [YYYY-MM] [--dry-run] [--config FILE] [--input-dir DIR]
 */

// cspell:words noai

// ─── Shared scripts
import { ChatlogCache } from '../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../_cle-libs/classes/ChatlogError.class.ts';
import { resolveChatlogsDir } from '../../_cle-libs/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_cle-libs/libs/file-ops/exists-utils.ts';
import { logger } from '../../_cle-libs/libs/io/logger.ts';
import { getFilename } from '../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_cle-libs/constants/defaults.constants.ts';
import { LOGGER_TEXT } from '../../_cle-libs/constants/logger.constants.ts';

// ─── Local
import { findChatlogFilePaths } from './libs/find-files-flat.ts';
import { loadClassifyEntries } from './libs/load-entries.ts';
import { loadProjectDic } from './libs/load-project-dic.ts';
import { buildConfig } from './modules/classify-config.ts';
import { classifyByAI } from './phases/phase-classify-ai.ts';
import { processClassifyNoAI } from './phases/phase-classify-noai.ts';
import { partitionEntries } from './phases/phase-partition.ts';
import { applyClassifications } from './phases/phase-write.ts';
// types
import type {
  ClassifyCache,
  ClassifyConfig,
  ClassifyPartition,
  ClassifyStats,
  ProjectDicEntry,
} from './types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from './constants/classify.constants.ts';

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * 入力ディレクトリを解決し、存在確認する。
 * 存在しない場合は `ChatlogError('InputNotFound', 'NotFound', ...)` を throw する。
 */
const _resolveInputDir = async (config: ClassifyConfig): Promise<string> => {
  const originalLogsDir = resolveChatlogsDir({
    chatlogsDir: config.chatlogsDir,
    agent: config.agent,
    period: config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: config.inputDir,
  });
  if (!await dirExists(originalLogsDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${originalLogsDir}`);
  }
  return originalLogsDir;
};

/**
 * プロジェクト辞書を読み込み、設定内容をログ出力する。
 */
const _loadProjects = async (config: ClassifyConfig): Promise<ProjectDicEntry> => {
  const projects = await loadProjectDic(config.projectsDic);
  const projectNames = Object.keys(projects);
  if (projectNames.every((name) => name === FALLBACK_PROJECT)) {
    logger.warn('projects.dic にプロジェクトが定義されていません。すべて misc に分類されます。');
  }

  logger.info(`対象 agent: ${config.agent}`);
  if (config.period) { logger.info(`対象期間: ${config.period}`); }
  if (config.dryRun) { logger.dryrun('ファイルは移動しません'); }
  logger.info(`プロジェクト候補: ${projectNames.join(', ')}`);

  return projects;
};

/**
 * 対象ファイル一覧を収集し、判定結果キャッシュを準備する。
 * 対象ファイルが0件の場合は完了ログを出力し `null` を返す。
 */
const _collectFilesAndCache = async (
  originalLogsDir: string,
): Promise<{ filePaths: string[]; cache: ChatlogCache<ClassifyCache> } | null> => {
  const filePaths = await findChatlogFilePaths(originalLogsDir);
  if (filePaths.length === 0) {
    logger.info('対象ファイルなし');
    logger.info('完了: moved=0 movedByAI=0 error=0 remaining=0 skip=0');
    return null;
  }
  const cache = new ChatlogCache<ClassifyCache>('classify-cache');
  await cache.ready;
  return { filePaths, cache };
};

/**
 * エントリ読み込み・キャッシュ分類・AI なし分類・AI 分類までを実行する。
 * ファイル移動（`applyClassifications`）はこの関数には含まない。
 */
const _classify = async (
  filePaths: string[],
  cache: ChatlogCache<ClassifyCache>,
  config: ClassifyConfig,
  projects: ProjectDicEntry,
  stats: ClassifyStats,
): Promise<ClassifyPartition> => {
  // Step 1: 分類候補エントリの読み込み。読み込み失敗（frontmatter パースエラー等）は errors に分離され、
  // 誤って処理を継続しないよう後続の事前分類・AI分類には渡らない
  const { entries, errors } = await loadClassifyEntries(filePaths, cache, config);
  if (errors.length > 0) {
    stats.error += errors.length;
    errors.forEach(({ filePath, error }) =>
      logger.warn(`${LOGGER_TEXT.INDENT}読み込み失敗 (${error.message}): ${getFilename(filePath)}`)
    );
  }

  // Step 2: キャッシュ済み/未キャッシュ分類
  const partition = partitionEntries(entries, cache);

  // Step 3: 分類 (AI なし)
  const { remaining } = await processClassifyNoAI(partition.uncached, cache, config);

  // Step 4: 分類（AI あり）
  await classifyByAI(remaining, projects, config, cache, config.dryRun);

  return partition;
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * classify-chatlogs スクリプトのエントリポイント。
 * - `--config` で指定された YAML を GlobalConfig に読み込み、model/chunkSize/concurrency のデフォルト値を解決する。
 * - 例外は catch せずそのまま呼び出し元に伝播する。
 */
export const main = async (argv?: string[]): Promise<void> => {
  const _config = buildConfig(argv ?? Deno.args);

  const _originalLogsDir = await _resolveInputDir(_config);
  const projects = await _loadProjects(_config);

  const stats: ClassifyStats = { moved: 0, movedByAI: 0, error: 0, remaining: 0, skip: 0 };

  const _collected = await _collectFilesAndCache(_originalLogsDir);
  if (_collected === null) { return; }
  const { filePaths: _filePaths, cache: _cache } = _collected;

  const _partition = await _classify(_filePaths, _cache, _config, projects, stats);

  // Step 5: ファイル移動
  await applyClassifications(
    [..._partition.cached, ..._partition.uncached],
    _originalLogsDir,
    _config.dryRun,
    { cache: _cache, stats },
    _config,
  );

  // サマリー
  const drySuffix = _config.dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${drySuffix}: moved=${stats.moved} movedByAI=${stats.movedByAI} error=${stats.error} remaining=${stats.remaining} skip=${stats.skip}`,
  );
};

if (import.meta.main) { await main(); }
