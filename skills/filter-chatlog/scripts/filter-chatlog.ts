#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/filter-chatlog.ts
// @(#): チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * filter_chatlog.ts — チャットログを claude CLI でバッチ判定し DISCARD ファイルを削除する
 *
 * 使い方:
 *   deno run --allow-read --allow-run filter_chatlog.ts [YYYY-MM] [--dry-run] [--input DIR]
 */

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

// -- constants --
import { LOGGER_HEADER } from '../../_scripts/constants/logger-header.constants.ts';

// -- external --
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-io/exists-utils.ts';
import { findFiles as findFilesLib } from '../../_scripts/libs/file-io/find-files.ts';
import { readTextFile } from '../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
import { parseFrontmatterEntries } from '../../_scripts/libs/text/frontmatter-utils.ts';
import { parseJsonArray } from '../../_scripts/libs/text/json-utils.ts';
import { parseConversation } from '../../_scripts/libs/text/markdown-utils.ts';

// -- internal --
// constants
import { DEFAULT_CHUNK_SIZE, DEFAULT_CONCURRENCY } from '../../_scripts/constants/defaults.constants.ts';
import { DEFAULT_FILTER_CONFIG } from './constants/filter.constants.ts';
// types
import type { FilterConfig, ParsedConfig } from './types/filter.types.ts';

export const DISCARD_THRESHOLD = 0.7;
export const MAX_BODY_CHARS = 8000;

export const SYSTEM_PROMPT = `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","decision":"KEEP or DISCARD","confidence":0.0,"reason":"..."},...]

KEEP: design decisions, reusable patterns, new concepts, architecture discussion
DISCARD: execution-only, trivial Q&A, no reusable insight, context-dependent`;

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface ClaudeResult {
  file: string;
  decision: 'KEEP' | 'DISCARD';
  confidence: number;
  reason: string;
}

// ─────────────────────────────────────────────
// 内容ベース事前フィルタ（obsidian_filter.py 移植）
// ─────────────────────────────────────────────

const _SYSTEM_PREFIXES = [
  '<system-reminder',
  '<command-name',
  '<command-message',
  '<local-command-stdout',
  '<ide_opened_file',
  '<ide_selection',
  '---\n',
];

const _EXCLUDE_FILENAME_PATTERNS = [
  'you-are-a-topic-and-tag-extraction-assistant',
  'say-ok-and-nothing-else',
  'command-message-claude-idd-framework',
  'command-message-deckrd-deckrd',
];

export const isSystemOnlyMessage = (text: string): boolean => {
  const stripped = text.trim();
  return _SYSTEM_PREFIXES.some((prefix) => stripped.startsWith(prefix));
};

export const isExcludedByFilename = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return _EXCLUDE_FILENAME_PATTERNS.some((pat) => lower.includes(pat));
};

export const isExcludedByContent = (
  body: string,
  minCharCount = 1000,
  minAssistantChars = 300,
): { excluded: boolean; reason: string } => {
  if (body.length < minCharCount) {
    return { excluded: true, reason: `本文が短すぎる (${body.length} < ${minCharCount} 文字)` };
  }

  const turns = parseConversation(body);
  const userTurns = turns.filter((t) => t.role === 'user');
  const assistantTurns = turns.filter((t) => t.role === 'assistant');

  if (userTurns.length === 0) {
    return { excluded: true, reason: 'Userターンが存在しない' };
  }

  if (userTurns.length === 1) {
    if (isSystemOnlyMessage(userTurns[0].text)) {
      return { excluded: true, reason: 'Userメッセージがシステム/コマンドタグのみ' };
    }
    const totalAssistantChars = assistantTurns.reduce((sum, t) => sum + t.text.length, 0);
    if (totalAssistantChars < minAssistantChars) {
      return {
        excluded: true,
        reason: `Assistantの応答が短すぎる (${totalAssistantChars} < ${minAssistantChars} 文字)`,
      };
    }
  }

  return { excluded: false, reason: '' };
};

// ─────────────────────────────────────────────
// 本文テキスト抽出
// ─────────────────────────────────────────────

export const extractBodyText = (body: string, maxChars = MAX_BODY_CHARS): string => {
  const turns = parseConversation(body);
  const parts = turns.map((t) => {
    const role = t.role === 'user' ? 'User' : 'Assistant';
    return `### ${role}\n${t.text}`;
  });
  return parts.join('\n\n').slice(0, maxChars);
};

// ─────────────────────────────────────────────
// ファイル列挙
// ─────────────────────────────────────────────

const _resolveSearchDir = (
  baseDir: string,
  period?: string,
): string => {
  if (!period) {
    return baseDir;
  }
  return `${baseDir}/${period.slice(0, 4)}/${period}`;
};

export const findMdFiles = (
  baseDir: string,
  period?: string,
): Promise<string[]> => {
  const _searchDir = _resolveSearchDir(baseDir, period);
  return findFilesLib(_searchDir);
};

// ─────────────────────────────────────────────
// 事前フィルタ
// ─────────────────────────────────────────────

export const prefilterFiles = async (files: string[]): Promise<string[]> => {
  const passed: string[] = [];
  let skipped = 0;

  for (const filePath of files) {
    const filename = filePath.split(/[/\\]/).pop()!;

    if (isExcludedByFilename(filename)) {
      logger.info(`  skipped (ファイル名パターン): ${filename}`);
      skipped++;
      continue;
    }

    let text: string;
    try {
      text = await readTextFile(filePath);
    } catch {
      skipped++;
      continue;
    }

    const { content } = parseFrontmatterEntries(text);
    if (!content.trim()) {
      skipped++;
      continue;
    }

    const { excluded, reason } = isExcludedByContent(content);
    if (excluded) {
      logger.info(`  skipped (${reason}): ${filename}`);
      skipped++;
      continue;
    }

    const bodyText = extractBodyText(content);
    if (!bodyText.trim()) {
      skipped++;
      continue;
    }

    passed.push(filePath);
  }

  logger.info(`事前フィルタ: 対象=${files.length} 通過=${passed.length} スキップ=${skipped}`);
  return passed;
};

// ─────────────────────────────────────────────
// バッチプロンプト構築
// ─────────────────────────────────────────────

export const buildBatchPrompt = async (files: string[]): Promise<string> => {
  const parts: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = filePath.split(/[/\\]/).pop()!;
    const text = await readTextFile(filePath);
    const { content } = parseFrontmatterEntries(text);
    const bodyText = extractBodyText(content, MAX_BODY_CHARS);

    parts.push(`=== FILE ${i + 1}: ${filename} ===\n${bodyText}`);
  }

  return parts.join('\n\n');
};

// ─────────────────────────────────────────────
// Claude CLI 呼び出し
// ─────────────────────────────────────────────

export const runClaude = async (prompt: string): Promise<string> => {
  const cmd = new Deno.Command('claude', {
    args: ['-p', SYSTEM_PROMPT, '--output-format', 'text'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'null',
  });

  const process = cmd.spawn();

  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const output = await process.output();
  if (!output.success) {
    throw new ChatlogError('CliError', `claude CLI がエラーで終了しました (code=${output.code})`);
  }

  return new TextDecoder().decode(output.stdout);
};

// ─────────────────────────────────────────────
// チャンク処理
// ─────────────────────────────────────────────

export interface Stats {
  kept: number;
  discarded: number;
  skipped: number;
  error: number;
}

export const processChunk = async (
  chunkFiles: string[],
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  const batchPrompt = await buildBatchPrompt(chunkFiles);

  let rawResult: string;
  try {
    rawResult = await runClaude(batchPrompt);
  } catch (e) {
    logger.warn(`  警告: claude CLI 実行失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  error: ${e}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (claude error): ${f.split(/[/\\]/).pop()}`);
      stats.kept++;
    }
    return;
  }

  const parsed = parseJsonArray<ClaudeResult>(rawResult);
  if (!parsed) {
    logger.warn(`  警告: JSON パース失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  raw output: ${rawResult.slice(0, 200)}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (parse error): ${f.split(/[/\\]/).pop()}`);
      stats.kept++;
    }
    return;
  }

  for (const filePath of chunkFiles) {
    const filename = filePath.split(/[/\\]/).pop()!;
    const result = parsed.find((r) => r.file === filename);

    if (!result) {
      logger.info(`  kept (not in result): ${filename}`);
      stats.kept++;
      continue;
    }

    const { decision, confidence, reason } = result;

    if (decision === 'DISCARD' && confidence >= DISCARD_THRESHOLD) {
      if (dryRun) {
        logger.log(`[dry-run] DISCARD (conf=${confidence}): ${filePath}`);
        logger.info(`  reason: ${reason}`);
        stats.discarded++;
      } else {
        logger.log(`DISCARD (conf=${confidence}): ${filePath}`);
        logger.info(`  reason: ${reason}`);
        try {
          await Deno.remove(filePath);
          stats.discarded++;
        } catch {
          logger.error(`  削除失敗: ${filePath}`);
          stats.error++;
        }
      }
    } else {
      logger.info(`  kept (decision=${decision}, conf=${confidence}): ${filename}`);
      stats.kept++;
    }
  }
};

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** `--option value` 形式のオプションと ParsedConfig キーのマッピング。 */
const _OPT_KEYS: Record<string, keyof ParsedConfig> = {
  '--input': 'inputDir',
  '--config': 'configFile',
};

/** `--flag` 形式（値なし）のオプションと ParsedConfig キーのマッピング。 */
const _OPT_FLAGS: Record<string, keyof ParsedConfig> = {
  '--dry-run': 'dryRun',
};

/**
 * コマンドライン引数を解析して ParsedConfig を返す。
 * - モデルのデフォルト値解決は `main()` で GlobalConfig を取得した後に行う。
 */
export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig<ParsedConfig>(args, _OPT_KEYS, _OPT_FLAGS) as ParsedConfig;
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な FilterConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - inputDir 優先順位: `parsed.inputDir` > `globalConfig.get('chatlogDir')` > `defaults.inputDir`
 * - dryRun: `parsed.dryRun` > `defaults.dryRun`（false）
 * - period: `parsed` のみ（GlobalConfig 連携なし）
 * - `configFile` は FilterConfig に存在しないため結果に含まれない。
 */
export function buildConfig(
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
  defaults?: FilterConfig,
): FilterConfig {
  const _defaults = defaults ?? DEFAULT_FILTER_CONFIG;
  const _agent = parsed.agent ?? (globalConfig.get('agent') as string | undefined) ?? _defaults.agent;
  const _inputDir = parsed.inputDir ?? (globalConfig.get('chatlogDir') as string | undefined) ?? _defaults.inputDir;
  const _chunkSize = parsed.chunkSize ?? (globalConfig.get('chunkSize') as number | undefined) ?? _defaults.chunkSize;
  const _concurrency = parsed.concurrency ?? (globalConfig.get('concurrency') as number | undefined)
    ?? _defaults.concurrency;
  const { configFile: _cf, ...rest } = parsed;
  return {
    ..._defaults,
    ...rest,
    agent: _agent,
    inputDir: _inputDir,
    chunkSize: _chunkSize,
    concurrency: _concurrency,
  };
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args?: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(args ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    const agentDir = `${_config.inputDir}/${_config.agent}`;

    // 入力ディレクトリ確認
    if (!await dirExists(agentDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${agentDir}`);
    }

    logger.info(`対象 agent: ${_config.agent}`);
    if (_config.period) { logger.info(`対象期間: ${_config.period}`); }

    // ファイル列挙
    const allFiles = await findMdFiles(agentDir, _config.period);

    // 事前フィルタ
    const targetFiles = await prefilterFiles(allFiles);

    const total = targetFiles.length;
    if (total === 0) {
      logger.info(`${LOGGER_HEADER.NO_FILE_FOUND}: 対象ファイルなし`);
      logger.info('完了: kept=0 discarded=0 skipped=0 error=0');
      return;
    }

    logger.info(`判定対象ファイル数: ${total}`);
    if (_config.dryRun) { logger.info('dry-run モード: ファイルは削除しません'); }

    // チャンク分割して並列処理
    const stats: Stats = { kept: 0, discarded: 0, skipped: 0, error: 0 };

    const _chunkSize = _config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const _concurrency = _config.concurrency ?? DEFAULT_CONCURRENCY;
    await runChunked(targetFiles, _chunkSize, (chunk) => processChunk(chunk, _config.dryRun, stats), _concurrency);

    // サマリー
    const drySuffix = _config.dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: kept=${stats.kept} discarded=${stats.discarded} skipped=${stats.skipped} error=${stats.error}`,
    );
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
