#!/usr/bin/env -S deno run --allow-read --allow-write
// src: scripts/prefilter-chatlogs.ts
// @(#): チャットログの高速事前フィルタスクリプト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * prefilter-chatlogs.ts — チャットログの高速事前フィルタスクリプト
 *
 * Claude API呼び出し前に、正規表現・テキストパターンで
 * 明らかなノイズファイルを削除候補として絞り込む。
 *
 * 対象パターン:
 *   1. ファイル名パターン  : say-ok, command-message-* 等
 *   2. Git操作ログのみ    : ===== GIT LOGS/DIFF ===== で始まるUser入力
 *   3. スキル呼び出し     : ---\nname: commit-message-generator 等のYAML先頭
 *   4. 定型APIプロンプト  : idd-framework の補助呼び出し（100-150文字生成等）
 *   5. スラッシュコマンド : /export-log, /deckrd 等のみのUser入力
 *   6. システムタグのみ   : <system-reminder> 等
 *   7. 短すぎる応答      : Assistantが100文字未満（1ターン限定）
 *
 * 使い方:
 *   deno run --allow-read --allow-write scripts/prefilter-chatlogs.ts
 *   deno run --allow-read --allow-write scripts/prefilter-chatlogs.ts codex 2026-01
 *   deno run --allow-read --allow-write scripts/prefilter-chatlogs.ts --dry-run
 *   deno run --allow-read --allow-write scripts/prefilter-chatlogs.ts --report
 *   deno run --allow-read --allow-write scripts/prefilter-chatlogs.ts --input ./temp/chatlogs
 */

// ─── shared ───
// functions
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
// classes
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';

// ─── internal ───
// functions
import { buildConfig, parseArgs } from './configs/prefilter-config.ts';
import { processNoiseFiles } from './modules/prefilter/process-noise-files.ts';

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[] = Deno.args): Promise<void> => {
  try {
    const _parsed = parseArgs(args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const { agent, period, baseDir, chatlogsDir, dryRun, report } = buildConfig(_parsed, _globalConfig);
    const _searchDir = resolveChatlogsDir({
      chatlogsDir: _parsed.chatlogsDir,
      baseDir: baseDir ?? chatlogsDir,
      agent,
      period,
    });

    if (!await dirExists(_searchDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${_searchDir}`);
    }

    const files = await findFiles(_searchDir);
    logger.info(`対象ファイル数: ${files.length}`);
    if (dryRun) {
      logger.info(`${report ? 'report' : 'dry-run'} モード: ファイルは削除しません`);
    }

    const stats = { noise: 0, keep: 0, error: 0 };
    await processNoiseFiles(files, stats, { dryRun, report });

    const suffix = dryRun ? ` (${report ? 'report' : 'dry-run'})` : '';
    logger.info(`\n完了${suffix}: noise=${stats.noise} keep=${stats.keep} error=${stats.error}`);
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
