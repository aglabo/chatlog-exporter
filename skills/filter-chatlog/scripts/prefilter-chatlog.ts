#!/usr/bin/env -S deno run --allow-read --allow-write
// src: scripts/prefilter-chatlog.ts
// @(#): チャットログの高速事前フィルタスクリプト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * prefilter_chatlog.ts — チャットログの高速事前フィルタスクリプト
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
 *   deno run --allow-read --allow-write scripts/prefilter_chatlog.ts
 *   deno run --allow-read --allow-write scripts/prefilter_chatlog.ts codex 2026-01
 *   deno run --allow-read --allow-write scripts/prefilter_chatlog.ts --dry-run
 *   deno run --allow-read --allow-write scripts/prefilter_chatlog.ts --report
 *   deno run --allow-read --allow-write scripts/prefilter_chatlog.ts --input ./temp/chatlog
 */

import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-io/exists-utils.ts';
import { findFiles as findFilesLib } from '../../_scripts/libs/file-io/find-files.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { buildConfig, parseArgs } from './config/prefilter-config.ts';
import { processNoiseFilterFiles } from './libs/process-noise-filter.ts';

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[] = Deno.args): Promise<void> => {
  try {
    const _parsed = parseArgs(args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const { agent, period, chatlogsDir, dryRun, report } = buildConfig(_parsed, _globalConfig);

    if (!await dirExists(chatlogsDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${chatlogsDir}`);
    }

    const _searchDir = resolveChatlogsDir({ baseDir: chatlogsDir, agent, period });
    const files = await findFilesLib(_searchDir);
    logger.info(`対象ファイル数: ${files.length}`);
    if (dryRun) {
      logger.info(`${report ? 'report' : 'dry-run'} モード: ファイルは削除しません`);
    }

    const counts = { noise: 0, keep: 0, error: 0 };
    await processNoiseFilterFiles(files, counts, { dryRun, report });

    const suffix = dryRun ? ` (${report ? 'report' : 'dry-run'})` : '';
    logger.info(`\n完了${suffix}: noise=${counts.noise} keep=${counts.keep} error=${counts.error}`);
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
