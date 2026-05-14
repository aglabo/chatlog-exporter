#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// src: scripts/export-chatlogs.ts
// @(#): AIエージェントのセッション履歴をMarkdownにエクスポートする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * export_chatlogs.ts — AIエージェントのセッション履歴をMarkdownにエクスポートする
 *
 * 使い方:
 *   deno run --allow-read --allow-write --allow-env export_chatlogs.ts \
 *     [agent] [YYYY-MM|YYYY] [project] --output DIR
 *
 * 対応エージェント:
 *   claude  — ~/.claude/projects/ 以下のJSONL
 *   codex   — ~/.codex/sessions/YYYY/MM/DD/ 以下のJSONL
 */

// ─── Shared modules ─────────────────────────────────────────────────────────
// error
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
// config
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
// libs
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import type { ArgsSchema } from '../../_scripts/types/args-schema.types.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// exporters
import { exportChatGPT } from './exporter/chatgpt-exporter.ts';
import { exportClaude } from './exporter/claude-exporter.ts';
import { exportCodex } from './exporter/codex-exporter.ts';
// constants
import { DEFAULT_EXPORT_CONFIG } from './constants/defaults.constants.ts';
// types
import type { ExportConfig, ParsedConfig } from './types/export-config.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** export-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgsSchema = [
  { option: '--output', field: 'outputDir', type: 'string' },
  { option: '--base', field: 'baseDir', type: 'directory' },
  { option: '--input', field: 'inputDir', type: 'string' },
  { option: '--config', field: 'configFile', type: 'string' },
];

/**
 * CLI 引数配列を解析して `ParsedConfig` を返す。
 *
 * @param args CLI 引数の配列 (通常は `Deno.args` または `main()` の `argv` パラメータ)
 * @returns 解析済みの `ParsedConfig`
 */
export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig<ParsedConfig>(args, _SCHEMA) as ParsedConfig;
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な ExportConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - outputDir 優先順位: `parsed.outputDir` > `globalConfig.get('chatlogsDir')` > `defaults.outputDir`
 * - baseDir 優先順位: `parsed.baseDir` > `defaults.baseDir`
 * - inputDir 優先順位: `parsed.inputDir` > `parsed.chatlogsDir` > `defaults.inputDir`
 * - period: `parsed.period` のみ (GlobalConfig に期間設定なし)
 */
export function buildConfig(
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
  defaults?: ExportConfig,
): ExportConfig {
  const _defaults = defaults ?? DEFAULT_EXPORT_CONFIG;
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _outputDir = parsed.outputDir ?? globalConfig.get('chatlogsDir') as string;
  const _baseDir = parsed.baseDir ?? _defaults.baseDir;
  const _inputDir = parsed.inputDir ?? parsed.chatlogsDir ?? _defaults.inputDir;
  const { configFile: _configFile, ...parsedRest } = parsed;
  return {
    ..._defaults,
    ...parsedRest,
    agent: _agent,
    outputDir: _outputDir,
    baseDir: _baseDir,
    inputDir: _inputDir,
  };
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * export-chatlogs スクリプトのエントリポイント。
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
 * `argv` 省略時は `Deno.args` を使用する (`import.meta.main` からの呼び出し用) 。
 * テストでは `argv` にモック引数を渡して実行できる。
 *
 * @param argv CLI 引数の配列。省略時は `Deno.args` を使用
 */
export const main = async (argv?: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(argv ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const config = buildConfig(_parsed, _globalConfig);
    const { agent, period, outputDir } = config;

    logger.info(`対象 agent: ${agent}`);
    if (period) { logger.info(`対象期間: ${period}`); }

    let result: Awaited<ReturnType<typeof exportClaude>>;

    switch (agent) {
      case 'claude':
        result = await exportClaude(config);
        break;
      case 'codex':
        result = await exportCodex(config);
        break;
      case 'chatgpt':
        if (!config.inputDir && !config.baseDir) {
          throw new ChatlogError(
            'InvalidArgs',
            'InputDir',
            'chatgpt エージェントには入力ディレクトリを指定してください (位置引数または --input)',
          );
        }
        result = await exportChatGPT(config);
        break;
      default:
        throw new ChatlogError('InvalidArgs', 'Agent', `未対応のエージェント: ${agent}`);
    }

    for (const outPath of result.outputPaths) {
      logger.log(outPath);
    }

    const total = result.exportedCount + result.skippedCount + result.errorCount;
    logger.info(
      `\n完了: ${total} 件処理 (出力: ${result.exportedCount} / スキップ: ${result.skippedCount} / エラー: ${result.errorCount}) `,
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
