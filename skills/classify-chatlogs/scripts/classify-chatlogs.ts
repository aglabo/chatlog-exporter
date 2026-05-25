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

// -- external --
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findEntries } from '../../_scripts/libs/file-ops/find-entries.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
// classes
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';

// -- internal --
import { FALLBACK_PROJECT } from './constants/classify.constants.ts';
import { loadProjectDic } from './libs/load-project-dic.ts';
// types
import type { ClassifyStats } from './types/classify.types.ts';

// -- modules --
import { ClassifyChatlogEntry } from './classes/ClassifyChatlogEntry.class.ts';
import { processChunk } from './modules/classify-ai.ts';
import { buildConfig, parseArgs } from './modules/classify-config.ts';
import { loadClassifyFileMeta, preClassify } from './modules/classify-meta.ts';
import { applyClassifications } from './modules/file-ops.ts';

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

    // ファイル列挙
    const _searchDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      baseDir: _config.baseDir,
      agent: _config.agent,
      period: _config.period,
    });
    const allFiles = await findEntries(
      [_searchDir],
      '.md',
    );
    if (allFiles.length === 0) {
      logger.info('対象ファイルなし');
      logger.info('完了: moved=0 movedByAI=0 skipped=0 error=0');
      return;
    }

    // メタデータ読み込み
    const _allMetas: ClassifyChatlogEntry[] = [];
    const stats: ClassifyStats = { moved: 0, movedByAI: 0, skipped: 0, error: 0, remaining: 0 };

    for (const filePath of allFiles) {
      const meta = await loadClassifyFileMeta(filePath);
      if (!meta) {
        stats.error++;
        continue;
      }
      _allMetas.push(meta);
    }

    // AI 不要なケースを事前に振り分ける
    const { buffer: _preBuffer, remaining: _remaining } = preClassify(_allMetas);
    await applyClassifications(_preBuffer, _config.dryRun, stats);

    logger.info(`\n対象ファイル数: ${_remaining.length} (スキップ: ${stats.skipped})`);

    if (_remaining.length === 0) {
      logger.info(
        `\n完了: moved=${stats.moved} movedByAI=${stats.movedByAI} skipped=${stats.skipped} error=${stats.error}`,
      );
      return;
    }

    // チャンク分割して並列処理
    const _chunkSize = _globalConfig.get('chunkSize') as number;
    const _concurrency = _globalConfig.get('concurrency') as number;
    const _chunkBuffers = await runChunked(
      _remaining,
      _chunkSize,
      (chunk) => processChunk(chunk, projects, _config.model),
      _concurrency,
    );
    for (const _chunkBuffer of _chunkBuffers) {
      await applyClassifications(_chunkBuffer, _config.dryRun, stats);
    }

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
