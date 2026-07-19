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
import { ChatlogCache } from '../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_scripts/constants/defaults.constants.ts';

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
import type { ClassifyCache, ClassifyStats } from './types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from './constants/classify.constants.ts';

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

  // 入力ディレクトリ確認
  const _originalLogsDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: _config.inputDir,
  });
  if (!await dirExists(_originalLogsDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${_originalLogsDir}`);
  }

  // プロジェクト辞書読み込み
  const projects = await loadProjectDic(_config.projectsDic);
  const _projectNames = Object.keys(projects);
  if (_projectNames.every((name) => name === FALLBACK_PROJECT)) {
    logger.warn('projects.dic にプロジェクトが定義されていません。すべて misc に分類されます。');
  }

  logger.info(`対象 agent: ${_config.agent}`);
  if (_config.period) { logger.info(`対象期間: ${_config.period}`); }
  if (_config.dryRun) { logger.info('dry-run モード: ファイルは移動しません'); }
  logger.info(`プロジェクト候補: ${_projectNames.join(', ')}`);

  const stats: ClassifyStats = { moved: 0, movedByAI: 0, error: 0, remaining: 0, skip: 0 };

  // Step 0: ファイルリスト、キャッシュ取得
  const _filePaths = await findChatlogFilePaths(_originalLogsDir);
  if (_filePaths.length === 0) {
    logger.info('対象ファイルなし');
    logger.info('完了: moved=0 movedByAI=0 error=0 remaining=0 skip=0');
    return;
  }
  // 判定結果キャッシュ
  const _cache = new ChatlogCache<ClassifyCache>('classify-cache');
  await _cache.ready;

  // Step 1: 分類候補エントリの読み込み。読み込み失敗（frontmatter パースエラー等）は errors に分離され、
  // 誤って処理を継続しないよう後続の事前分類・AI分類には渡らない
  const { entries, errors } = await loadClassifyEntries(_filePaths, _cache);
  if (errors.length > 0) {
    stats.error += errors.length;
    errors.forEach(({ filePath, error }) => logger.warn(`  読み込み失敗 (${error.message}): ${getFilename(filePath)}`));
  }

  // Step 2: キャッシュ済み/未キャッシュ分類
  const _partition = partitionEntries(entries, _cache);

  // Step 3: 分類 (AI なし)
  const { remaining } = await processClassifyNoAI(_partition.uncached, _cache);

  // Step 4: 分類（AI あり）
  await classifyByAI(remaining, projects, _config, _cache, _config.dryRun);

  // Step 5: ファイル移動
  await applyClassifications(
    [..._partition.cached, ..._partition.uncached],
    _cache,
    _originalLogsDir,
    _config.dryRun,
    stats,
    _config,
  );

  // サマリー
  const drySuffix = _config.dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${drySuffix}: moved=${stats.moved} movedByAI=${stats.movedByAI} error=${stats.error} remaining=${stats.remaining} skip=${stats.skip}`,
  );
};

if (import.meta.main) { await main(); }
