#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// src: scripts/export-chatlog.ts
// @(#): AIエージェントのセッション履歴をMarkdownにエクスポートする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * export_chatlog.ts — AIエージェントのセッション履歴をMarkdownにエクスポートする
 *
 * 使い方:
 *   deno run --allow-read --allow-write --allow-env export_chatlog.ts \
 *     [agent] [YYYY-MM|YYYY] [project] --output DIR
 *
 * 対応エージェント:
 *   claude  — ~/.claude/projects/ 以下のJSONL
 *   codex   — ~/.codex/sessions/YYYY/MM/DD/ 以下のJSONL
 */

// ─── External modules ───────────────────────────────────────────────────────
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { isKnownAgent } from '../../_scripts/constants/agents.constants.ts';
import { normalizePath } from '../../_scripts/libs/file-io/path-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';

// ─── Internal modules ───────────────────────────────────────────────────────
import { exportChatGPT } from './exporter/chatgpt-exporter.ts';
import { exportClaude } from './exporter/claude-exporter.ts';
import { exportCodex } from './exporter/codex-exporter.ts';
// constants
import { DEFAULT_EXPORT_CONFIG } from './constants/defaults.constants.ts';
// types
import type { ExportConfig } from './types/export-config.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/**
 * CLI 引数配列を解析して `ExportConfig` を生成する。
 *
 * 認識する引数:
 * - `--output <dir>` または `--output=<dir>`: 出力ベースディレクトリを設定
 * - `--base <dir>` または `--base=<dir>`: 入力ベースディレクトリ（baseDir）を設定
 * - `--input <dir>` または `--input=<dir>`: ChatGPT エクスポートディレクトリ（inputDir）を設定
 * - `KNOWN_AGENTS` に含まれる文字列: エージェント名として認識（"claude", "codex", "chatgpt"）
 * - `/^\d{4}-\d{2}$/` または `/^\d{4}$/` にマッチする文字列: 期間として認識
 * - `/` を含む位置引数（`\` → `/` 正規化後): ChatGPT エクスポートディレクトリ（inputDir）として認識
 *
 * 未知のオプション（`--` で始まる認識外の文字列）または
 * 未知の位置引数（エージェント名・期間・パス以外）が指定された場合は
 * `console.error` にエラーメッセージを出力して `Deno.exit(1)` を呼ぶ。
 *
 * `DEFAULT_EXPORT_CONFIG` をベースとしてスプレッドコピーし、
 * 指定された引数で上書きした `ExportConfig` を返す。
 *
 * @param args CLI 引数の配列（通常は `Deno.args` または `main()` の `argv` パラメータ）
 * @returns 解析済みの `ExportConfig`
 */
export const parseArgs = (args: string[]): ExportConfig => {
  const _config: ExportConfig = { ...DEFAULT_EXPORT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const eqIdx = arg.indexOf('=');
    const flag = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const eqVal = eqIdx >= 0 ? arg.slice(eqIdx + 1) : undefined;

    switch (flag) {
      case '--output':
        _config.outputDir = eqVal ?? args[++i];
        break;
      case '--base':
        _config.baseDir = eqVal ?? args[++i];
        break;
      case '--input':
        _config.inputDir = eqVal ?? args[++i];
        break;
      default: {
        if (flag.startsWith('-')) {
          throw new ChatlogError('InvalidArgs', `不明なオプション: ${arg}`);
        }
        if (isKnownAgent(arg)) {
          _config.agent = arg;
        } else if (/^\d{4}-\d{2}$/.test(arg) || /^\d{4}$/.test(arg)) {
          _config.period = arg;
        } else {
          const normalized = normalizePath(arg);
          if (normalized.includes('/')) {
            _config.inputDir = normalized;
          } else {
            throw new ChatlogError('InvalidArgs', `不明な引数: ${arg}`);
          }
        }
      }
    }
  }

  return _config;
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * export-chatlog スクリプトのエントリポイント。
 *
 * 処理フロー:
 * 1. `parseArgs()` で argv を解析して `ExportConfig` を取得
 * 2. `parsePeriod()` で期間フィルタ `PeriodRange` を生成
 * 3. `agent` に応じて `findClaudeSessions` / `findCodexSessions` で
 *    セッションファイル一覧を収集
 * 4. 各ファイルに対して対応する `parse*Session()` でパースし、
 *    有効なセッションを `writeSession()` で Markdown として書き出す
 * 5. 生成した Markdown ファイルパスを `console.log` に出力し、
 *    進行状況・エラーを `console.error` に出力する
 *
 * `argv` 省略時は `Deno.args` を使用する（`import.meta.main` からの呼び出し用）。
 * テストでは `argv` にモック引数を渡して実行できる。
 *
 * @param argv CLI 引数の配列。省略時は `Deno.args` を使用
 */
export const main = async (argv?: string[]): Promise<void> => {
  try {
    const config = parseArgs(argv ?? Deno.args);
    const { agent, period, outputDir } = config;

    logger.info(`対象 agent: ${agent}`);
    if (period) { logger.info(`対象期間: ${period}`); }

    let result: Awaited<ReturnType<typeof exportClaude>>;

    if (agent === 'claude') {
      result = await exportClaude(config);
    } else if (agent === 'codex') {
      result = await exportCodex(config);
    } else if (agent === 'chatgpt') {
      if (!config.inputDir && !config.baseDir) {
        throw new ChatlogError(
          'InvalidArgs',
          'chatgpt エージェントには入力ディレクトリを指定してください（位置引数または --input）',
        );
      }
      result = await exportChatGPT(config);
    } else {
      throw new ChatlogError('InvalidArgs', `未対応のエージェント: ${agent}`);
    }

    for (const outPath of result.outputPaths) {
      logger.log(outPath);
    }

    const total = result.exportedCount + result.skippedCount + result.errorCount;
    logger.info(
      `\n完了: ${total} 件処理（出力: ${result.exportedCount} / スキップ: ${result.skippedCount} / エラー: ${result.errorCount}）`,
    );
    logger.info(`出力先: ${outputDir}/${agent}/`);
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) { await main(); }
