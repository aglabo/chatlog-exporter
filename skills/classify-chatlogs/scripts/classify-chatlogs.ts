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
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_scripts/constants/defaults.constants.ts';

// ─── Local
import { loadProjectDic } from './libs/load-project-dic.ts';
import { classifyByAI } from './modules/classify-ai.ts';
import { buildConfig } from './modules/classify-config.ts';
import { applyClassifications } from './modules/file-ops.ts';
import { partitionClassifyEntries } from './modules/partition-classify-entries.ts';
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
  const _agentDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: _config.inputDir,
  });
  if (!await dirExists(_agentDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${_agentDir}`);
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

  // 対象ディレクトリ
  const _searchDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: _config.inputDir,
  });

  const stats: ClassifyStats = { moved: 0, movedByAI: 0, skipped: 0, error: 0, remaining: 0 };

  // 判定結果キャッシュ
  const _cache = new ChatlogCache<ClassifyCache>('classify-cache');
  await _cache.ready;

  // Step 1: バッファ取得 + AI なし事前分類 + キャッシュ振り分け
  const _partition = await partitionClassifyEntries(_searchDir, _cache);
  if (_partition.filePaths.length === 0) {
    logger.info('対象ファイルなし');
    logger.info('完了: moved=0 movedByAI=0 skipped=0 error=0');
    return;
  }

  // Step 2: 分類（AI あり）
  await classifyByAI(_partition.uncached, projects, _config, _cache);

  // Step 3: ファイル移動
  await applyClassifications(_partition.filePaths, _partition.entries, _cache, _searchDir, _config.dryRun, stats);

  // サマリー
  const drySuffix = _config.dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${drySuffix}: moved=${stats.moved} movedByAI=${stats.movedByAI} skipped=${stats.skipped} error=${stats.error}`,
  );
};

if (import.meta.main) { await main(); }
