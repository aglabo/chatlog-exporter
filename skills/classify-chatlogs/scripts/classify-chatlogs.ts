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
 *     [agent] [YYYY-MM] [--dry-run] [--config FILE] [--base-dir DIR] [--chatlogs-dir DIR]
 */

// cspell:words noai

// ─── Shared scripts
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';

// ─── Local
import { loadProjectDic } from './libs/load-project-dic.ts';
import { classifyByAI } from './modules/classify-ai.ts';
import { buildConfig, parseArgs } from './modules/classify-config.ts';
import { processPreclassify } from './modules/classify-noai.ts';
import { moveClassified } from './modules/file-ops.ts';
import { findBufferEntries } from './modules/find-buffer-entries.ts';
// types
import type { ClassifyBuffer, ClassifyConfig, ClassifyStats, ProjectDicEntry } from './types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from './constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from './types/classify.types.ts';

// ─────────────────────────────────────────────
// processClassify
// ─────────────────────────────────────────────

/**
 * 分類バッファに対して AI なし事前分類・AI 分類を実行し、結合した分類済みバッファを返す。
 */
export const processClassify = async (
  allEntries: ClassifyBuffer,
  projects: ProjectDicEntry,
  config: Pick<ClassifyConfig, 'chunkSize' | 'concurrency' | 'model'>,
): Promise<ClassifyBuffer> => {
  const _preClassified = processPreclassify(allEntries);
  const _resolved = _preClassified.filter((e) => e.action !== CLASSIFY_ACTIONS.REMAINING);
  const _aiClassified = await classifyByAI(_preClassified, projects, config);
  return [..._resolved, ..._aiClassified];
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * classify-chatlogs スクリプトのエントリポイント。
 * - `--config` で指定された YAML を GlobalConfig に読み込み、model/chunkSize/concurrency のデフォルト値を解決する。
 * - `ChatlogError` はログに出力して `exit(1)` する。その他の例外は再スローする。
 */
export const main = async (argv?: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(argv ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    // 入力ディレクトリ確認
    const _agentDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      baseDir: _config.baseDir,
      agent: _config.agent,
      period: _config.period,
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
      baseDir: _config.baseDir,
      agent: _config.agent,
      period: _config.period,
    });

    const stats: ClassifyStats = { moved: 0, movedByAI: 0, skipped: 0, error: 0, remaining: 0 };

    // Step 1: バッファ取得
    const _buffer = await findBufferEntries(_searchDir, undefined, stats);
    if (_buffer.length === 0) {
      logger.info('対象ファイルなし');
      logger.info('完了: moved=0 movedByAI=0 skipped=0 error=0');
      return;
    }

    // Step 2: 分類（AI なし + AI あり）
    const _classified = await processClassify(_buffer, projects, _config);

    // Step 3: ファイル移動
    await moveClassified(_classified, _searchDir, _config.dryRun, stats);

    // サマリー
    const drySuffix = _config.dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: moved=${stats.moved} movedByAI=${stats.movedByAI} skipped=${stats.skipped} error=${stats.error}`,
    );
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) { await main(); }
