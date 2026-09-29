#!/usr/bin/env -S deno run --allow-read --allow-write
// src: scripts/noise-filter-chatlogs.ts
// @(#): チャットログの高速事前フィルタスクリプト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * noise-filter-chatlogs.ts — チャットログの高速事前フィルタスクリプト
 *
 * Claude API呼び出し前に、正規表現・テキストパターンで
 * 明らかなノイズファイルを削除候補として絞り込む。
 * 処理は2段階構成: 事前フィルタ（prefilterFiles）→ ノイズ判定（processNoiseFiles）。
 *
 * 事前フィルタ段階（prefilterFiles）:
 *   1. ファイル名パターン  : say-ok, command-message-* 等
 *   2. 本文の最小文字数    : minCharCount 未満（デフォルト1000文字）
 *   3. Assistant応答の最小文字数 : User1ターン時、minAssistantChars 未満（デフォルト300文字）
 *
 * ノイズ判定段階（processNoiseFiles）:
 *   1. Git操作ログのみ    : ===== GIT LOGS/DIFF ===== で始まるUser入力
 *   2. スキル呼び出し     : ---\nname: commit-message-generator 等のYAML先頭
 *   3. 定型APIプロンプト  : idd-framework の補助呼び出し（100-150文字生成等）
 *   4. スラッシュコマンド : /export-log, /deckrd 等のみのUser入力
 *   5. システムタグのみ   : <system-reminder> 等
 *   6. 短すぎる応答      : Assistantが100文字未満（1ターン限定、MIN_ASSISTANT_CHARS）
 *
 * 使い方:
 *   deno run --allow-read --allow-write scripts/noise-filter-chatlogs.ts
 *   deno run --allow-read --allow-write scripts/noise-filter-chatlogs.ts codex 2026-01
 *   deno run --allow-read --allow-write scripts/noise-filter-chatlogs.ts --dry-run
 *   deno run --allow-read --allow-write scripts/noise-filter-chatlogs.ts --input-dir ./temp/chatlogs
 */

// ─── shared ───
// functions
import { resolveChatlogsDir } from '../../_cle-libs/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_cle-libs/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../_cle-libs/libs/file-ops/find-files.ts';
import { logger } from '../../_cle-libs/libs/io/logger.ts';
// classes
import { ChatlogError } from '../../_cle-libs/classes/ChatlogError.class.ts';
// constants
import { LOGGER_TEXT } from '../../_cle-libs/constants/logger.constants.ts';

// ─── internal ───
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_cle-libs/constants/defaults.constants.ts';
// types
import type { NoiseFilterStats } from './types/stats.types.ts';
// functions
import { buildConfig } from './configs/noise-filter-config.ts';
import { loadFilterEntries } from './libs/load-filter-entry.ts';
import { processNoiseFiles } from './modules/noise-filter/process-noise-files.ts';
import { prefilterFiles } from './modules/prefilter.ts';

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[] = Deno.args): Promise<void> => {
  const { agent, period, chatlogsDir, inputDir, dryRun, minCharCount, minAssistantChars, concurrency } = buildConfig(
    args,
  );
  const _searchDir = resolveChatlogsDir({
    chatlogsDir,
    agent,
    period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: inputDir,
  });

  if (!await dirExists(_searchDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `入力ディレクトリが見つかりません: ${_searchDir}`);
  }

  const files = await findFiles(_searchDir);
  logger.info(`対象ファイル数: ${files.length}`);
  if (dryRun) {
    logger.dryrun('ファイルは削除しません');
  }

  const stats: NoiseFilterStats = { keep: 0, skip: 0, remove: 0, error: 0 };

  // 候補ファイルを読み込む。読み込み失敗（ファイル I/O・frontmatter パースエラー等）は errors に分離され、
  // 誤って削除しないよう prefilterFiles/processNoiseFiles には渡らない
  const { entries, errors } = await loadFilterEntries(files, undefined, concurrency);
  if (errors.length > 0) {
    stats.error += errors.length;
    errors.forEach(({ filePath, error }) =>
      logger.error(`${LOGGER_TEXT.INDENT}読み込み失敗 (${error.message}): ${filePath}`)
    );
  }

  const targetEntries = await prefilterFiles(entries, stats, {
    minCharCount,
    minAssistantChars,
    dryRun,
    concurrency,
  });

  await processNoiseFiles(targetEntries, stats, { dryRun, concurrency });

  const suffix = dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${suffix}: keep=${stats.keep} skip=${stats.skip} remove=${stats.remove} error=${stats.error}`,
  );
};

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
}
