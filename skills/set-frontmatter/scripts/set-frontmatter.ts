#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write --allow-env
// src: scripts/set-frontmatter.ts
// @(#): チャットログMarkdownにAI生成フロントマターを並列付加する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * set_frontmatter.ts — チャットログMarkdownにAI生成フロントマターを並列付加する
 *
 * 使い方:
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts --output-dir <dir> [--dry-run] [--review] [--dics DIR] [--config FILE]
 *
 * 処理フロー:
 *   Phase 1.1: ファイル列挙・メタ読み込み
 *   Phase 1.2: エントリ分割 (written/reviewed/generate)
 *   Phase 2.1: type・category同時判定 (並列, 1回のAI呼び出し)
 *   Phase 2.2: フロントマター生成 (並列, category起点)
 *   Phase 2.3: ステータス設定
 *   Phase 3.1: レビュー・修正 (並列)
 *   Phase 4.1: Markdownへ書き込み
 */

// cspell:words dics setfm

// ─── Shared scripts
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { LOGGER_TEXT } from '../../_scripts/constants/logger.constants.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { ChatlogCache } from '../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../_scripts/classes/ChatlogEntry.class.ts';
import { loadDics, loadPrompts } from './modules/setfm-assets-loader.ts';
import { phaseFrontmatter } from './phases/phase-frontmatter.ts';
import { phaseReview } from './phases/phase-review.ts';
import { phaseStatus } from './phases/phase-status.ts';
import { phaseTypeAndCategory } from './phases/phase-type-category.ts';
import { filterWriteEntry, phaseWrite } from './phases/phase-write.ts';
// types
import { CACHE_STATUSES } from '../../_scripts/types/cache-status.const.types.ts';
import { buildConfig } from './modules/setfm-config.ts';
import { loadAllEntries } from './modules/setfm-entry-loader.ts';
import type { SetfmCache } from './types/cache.types.ts';
// types
import type { Stats } from './types/phase.types.ts';

// ─── Internal constants

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * エントリ配列を writtenEntries・reviewedEntries・generateEntries の3グループに分割する。
 *
 * - `writtenEntries`: `status === 'written'` のエントリ（書き込み済み・スキップ対象）
 * - `reviewedEntries`: `status === 'reviewed'` のみのエントリ（書き込み待ち）
 * - `generateEntries`: 上記以外のエントリ（`status === ''` / `'need-review'` / `'review-failed'` / `'set-types'` / キャッシュミス）
 *
 * 3グループは重複なし・漏れなし（エントリの総数が保たれる）。
 *
 * @param entries - 分割対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @returns `{ writtenEntries, reviewedEntries, generateEntries }` — 互いに素な3グループ
 */
const _splitEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
): { writtenEntries: ChatlogEntry[]; reviewedEntries: ChatlogEntry[]; generateEntries: ChatlogEntry[] } => {
  const writtenEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.WRITTEN);
  const reviewedEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  const generateEntries = entries.filter((e) => {
    const status = cache.read(e.filePath!).status;
    return (
      status === undefined
      || (status !== CACHE_STATUSES.WRITTEN && status !== CACHE_STATUSES.REVIEWED)
    );
  });
  return { writtenEntries, reviewedEntries, generateEntries };
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[]): Promise<void> => {
  const _config = buildConfig(args);
  const _globalConfig = GlobalConfig.getInstance();
  const _inputDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: 'normalizelogs',
    override: _config.inputDir || undefined,
  });

  if (!await dirExists(_inputDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `ディレクトリが見つかりません: ${_inputDir}`);
  }

  const _cache = new ChatlogCache<SetfmCache>(
    'fm-cache',
    _config.cacheDir,
    { outputDir: _config.outputDir },
  );
  await _cache.ready;

  const [dics, prompts] = await Promise.all([loadDics(_config.dicsDir), loadPrompts(_config.promptsDir)]);
  logger.info(
    `辞書読み込み完了: category=${dics.category.split(',').length}件 `
      + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
      + `types=${dics.typeEntries.length}件`,
  );

  if (!_config.review) { logger.info('--no-review モード: Phase 3.1 をスキップします'); }

  const maxContentLength = _globalConfig.get('maxContentLength') as number;
  const stats: Stats = { total: 0, success: 0, fail: 0, skip: 0, written: 0 };

  // Phase 1.1: メタ読み込み
  const entries = await loadAllEntries(_inputDir, stats, _config.concurrency);
  logger.info(`メタ読み込み: ${entries.length}件（スキップ: ${stats.skip}件）`);
  if (entries.length === 0) {
    logger.info('対象ファイルなし');
    return;
  }

  // Phase 1.2: エントリ3分割（written / reviewed / generate）
  const { writtenEntries, reviewedEntries, generateEntries } = _splitEntries(entries, _cache);
  stats.written = writtenEntries.length;
  logger.info(
    `分割: written=${writtenEntries.length}件 reviewed=${reviewedEntries.length}件 generate=${generateEntries.length}件`,
  );

  // Phase 2.1: type・category同時判定（並列）
  logger.info(
    `\nPhase 2.1: type・category判定開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
  );
  await phaseTypeAndCategory(
    generateEntries,
    _cache,
    maxContentLength,
    dics,
    prompts,
    _config.concurrency,
    _config.dryRun,
  );

  // Phase 2.2: フロントマター生成（並列）
  logger.info(`\nPhase 2.2: フロントマター生成開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`);
  await phaseFrontmatter(
    generateEntries,
    _cache,
    maxContentLength,
    dics,
    prompts,
    _config.concurrency,
    _config.dryRun,
    undefined,
    _config.maxRetry,
  );

  // Phase 2.3: ステータス設定
  logger.info(`\nPhase 2.3: ステータス設定 (${generateEntries.length}件)`);
  await phaseStatus(generateEntries, _cache, _config.dryRun);

  // Phase 3.1: レビュー（並列）
  if (_config.review) {
    logger.info(
      `\nPhase 3.1: フロントマターレビュー開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
    );
    await phaseReview(
      generateEntries,
      _cache,
      dics,
      prompts,
      _config.concurrency,
      _config.dryRun,
      undefined,
      _config.maxRetry,
    );
  } else {
    logger.info(`\nPhase 3.1: スキップ (--no-review)`);
  }

  // Phase 4.1: 書き込み
  const _candidateEntries = [...reviewedEntries, ...generateEntries];
  const _writeEntries = _candidateEntries.filter((e) => filterWriteEntry(e.filePath!, _cache, _config.review));
  if (!_config.dryRun) {
    const _failEntries = _candidateEntries.filter((e) => !filterWriteEntry(e.filePath!, _cache, _config.review));
    _failEntries.forEach((e) => {
      logger.error(`${LOGGER_TEXT.INDENT}FAIL (yaml空): ${getFilename(e.filePath!)}`);
      stats.fail++;
    });
  }
  await phaseWrite(_writeEntries, _cache, { ..._config, inputDir: _inputDir }, stats);

  logger.info(
    `\n完了: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip} written=${stats.written} target=${_candidateEntries.length}`,
  );
};

if (import.meta.main) {
  await main(Deno.args);
}

// ─── Test exports (テスト専用・本番コードから import 禁止)
export { _splitEntries as _splitEntriesForTest };
