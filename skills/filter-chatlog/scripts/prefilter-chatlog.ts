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

import { ChatlogEntry } from '../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-io/exists-utils.ts';
import { findFiles as findFilesLib } from '../../_scripts/libs/file-io/find-files.ts';
import { normalizePath } from '../../_scripts/libs/file-io/path-utils.ts';
import { readTextFile } from '../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { parseConversation, type Turn } from '../../_scripts/libs/text/markdown-utils.ts';
import { DEFAULT_PREFILTER_CONFIG, MIN_ASSISTANT_CHARS } from './constants/filter.constants.ts';
import {
  NOISE_FILENAME_PATTERNS,
  NOISE_USER_EXACT_PATTERNS,
  NOISE_USER_PREFIX_PATTERNS,
  SYSTEM_TAG_PATTERN,
} from './constants/patterns.constants.ts';
import type { PrefilterConfig, PrefilterParsedConfig } from './types/prefilter.types.ts';

// ─────────────────────────────────────────────
// 個別判定ロジック
// ─────────────────────────────────────────────

export const checkFilename = (filename: string): string | null => {
  const lower = filename.toLowerCase();
  for (const pat of NOISE_FILENAME_PATTERNS) {
    if (pat.test(lower)) { return `ファイル名パターン: ${pat}`; }
  }
  return null;
};

export const checkUserContent = (turns: Turn[]): string | null => {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length === 0) { return 'Userターンが存在しない'; }

  // 全Userターンがシステムタグのみ
  if (userTurns.every((t) => SYSTEM_TAG_PATTERN.test(t.text))) {
    return '全UserターンがシステムTagのみ';
  }

  // 全Userターンが /コマンドのみ
  if (userTurns.every((t) => t.text.trim().split('\n').every((l) => l.trim().startsWith('/')))) {
    return '全Userターンが/コマンドのみ';
  }

  // 1ターンのみの詳細チェック
  if (userTurns.length === 1) {
    const text = userTurns[0].text;

    // 前方一致パターン
    for (const { pattern, label } of NOISE_USER_PREFIX_PATTERNS) {
      if (pattern.test(text)) { return label; }
    }

    // 完全一致パターン
    for (const { pattern, label } of NOISE_USER_EXACT_PATTERNS) {
      if (pattern.test(text.trim())) { return label; }
    }

    // システムタグのみ
    if (SYSTEM_TAG_PATTERN.test(text)) { return 'UserがシステムTagのみ'; }
  }

  return null;
};

export const checkAssistantContent = (turns: Turn[]): string | null => {
  const userTurns = turns.filter((t) => t.role === 'user');
  const assistantTurns = turns.filter((t) => t.role === 'assistant');

  if (userTurns.length === 1 && assistantTurns.length > 0) {
    const total = assistantTurns.reduce((sum, t) => sum + t.text.length, 0);
    if (total < MIN_ASSISTANT_CHARS) {
      return `Assistant応答が短すぎる (${total} < ${MIN_ASSISTANT_CHARS} 文字)`;
    }
  }
  return null;
};

// ─────────────────────────────────────────────
// メイン判定関数
// ─────────────────────────────────────────────

export const classifyFile = (filename: string, text: string): { isNoise: boolean; reason: string } => {
  // 1. ファイル名チェック
  const filenameReason = checkFilename(filename);
  if (filenameReason) { return { isNoise: true, reason: filenameReason }; }

  // 2. ChatlogEntry インスタンス生成（frontmatter + content 読み込み）
  //    不正フォーマット（閉じ区切りなし）の場合は先頭の区切り行を除去して再生成する
  let _entry: ChatlogEntry;
  try {
    _entry = new ChatlogEntry(text);
  } catch {
    _entry = new ChatlogEntry(text.replace(/^---\n/, ''));
  }

  // 3. 会話ターン解析
  const turns = parseConversation(_entry.content);

  // 4. User本文チェック
  const userReason = checkUserContent(turns);
  if (userReason) { return { isNoise: true, reason: userReason }; }

  // 5. Assistant応答の長さチェック
  const assistantReason = checkAssistantContent(turns);
  if (assistantReason) { return { isNoise: true, reason: assistantReason }; }

  return { isNoise: false, reason: '' };
};

// ─────────────────────────────────────────────
// ファイル列挙
// ─────────────────────────────────────────────

const _resolveSearchDir = async (baseDir: string, agent: string, period?: string): Promise<string> => {
  const _agentDir = `${baseDir}/${agent}`;

  if (!period) {
    return _agentDir;
  }

  const _yyyy = period.slice(0, 4);
  // YYYY/YYYY-MM 構造（codex等）
  const _withYear = `${_agentDir}/${_yyyy}/${period}`;
  // YYYY-MM 直下構造（claude等）
  const _flat = `${_agentDir}/${period}`;

  return await dirExists(_withYear) ? _withYear : _flat;
};

export const findMdFiles = async (baseDir: string, agent: string, period?: string): Promise<string[]> => {
  const _searchDir = await _resolveSearchDir(baseDir, agent, period);
  return findFilesLib(_searchDir);
};

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

export const buildConfig = (
  parsed: PrefilterParsedConfig,
  globalConfig: GlobalConfig,
  defaults: PrefilterConfig = DEFAULT_PREFILTER_CONFIG,
): PrefilterConfig => {
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _globalChatlogDir = globalConfig.get('chatlogsDir') as string;
  const _inputDir = parsed.inputDir ?? parsed.chatlogsDir ?? _globalChatlogDir;
  const _chatlogsDir = parsed.chatlogsDir ?? _globalChatlogDir;
  const { configFile: _configFile, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    agent: _agent,
    inputDir: _inputDir,
    chatlogsDir: _chatlogsDir,
  };
};

const _OPT_KEYS: Record<string, keyof PrefilterParsedConfig> = {
  '--input': 'inputDir',
  '--chatlogs-dir': 'chatlogsDir',
  '--config': 'configFile',
};

const _OPT_FLAGS: Record<string, keyof PrefilterParsedConfig> = {
  '--dry-run': 'dryRun',
  '--report': 'report',
};

export const parseArgs = (args: string[]): PrefilterParsedConfig => {
  const _parsed = parseArgsToConfig<PrefilterParsedConfig>(args, _OPT_KEYS, _OPT_FLAGS) as PrefilterParsedConfig;
  _parsed.dryRun ??= (_parsed.dryRun ?? false) || (_parsed.report ?? false);
  _parsed.report ??= false;
  return {
    ..._parsed,
  };
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[] = Deno.args): Promise<void> => {
  try {
    const _parsed = parseArgs(args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const { agent, period, inputDir, dryRun, report } = buildConfig(_parsed, _globalConfig);

    if (!await dirExists(inputDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${inputDir}`);
    }

    const files = await findMdFiles(inputDir, agent, period);
    logger.info(`対象ファイル数: ${files.length}`);
    if (dryRun) {
      logger.info(`${report ? 'report' : 'dry-run'} モード: ファイルは削除しません`);
    }

    const counts = { noise: 0, keep: 0, error: 0 };

    for (const filePath of files) {
      const filename = normalizePath(filePath).split('/').pop()!;

      let text: string;
      try {
        text = await readTextFile(filePath);
      } catch (e) {
        logger.error(`  error (${filename}): ${e}`);
        counts.error++;
        continue;
      }

      const { isNoise, reason } = classifyFile(filename, text);

      if (isNoise) {
        counts.noise++;
        if (report) {
          logger.log(`NOISE\t${reason}\t${filePath}`);
        } else if (dryRun) {
          logger.log(filePath);
        } else {
          try {
            await Deno.remove(filePath);
            logger.info(`deleted: ${filePath}`);
          } catch (e) {
            logger.error(`  削除失敗: ${filename}: ${e}`);
            counts.error++;
            counts.noise--;
          }
        }
      } else {
        counts.keep++;
      }
    }

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
