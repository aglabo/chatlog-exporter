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
 *     [agent] [YYYY-MM|YYYY] [project] --output-dir DIR
 *
 * 対応エージェント:
 *   claude  — ~/.claude/projects/ 以下のJSONL
 *   codex   — ~/.codex/sessions/YYYY/MM/DD/ 以下のJSONL
 */

// ─── Shared modules ─────────────────────────────────────────────────────────
// error
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
// libs
import { logger } from '../../_scripts/libs/io/logger.ts';
import { parseArgs } from '../../_scripts/libs/io/parse-args.ts';
import { joinPath } from '../../_scripts/libs/path-utils/path-utils.ts';
import type { ArgSchema } from '../../_scripts/types/args-schema.types.ts';
// constants
import { DEFAULT_CHATLOGS_DIR, DEFAULT_ORIGINAL_LOGS_DIR } from '../../_scripts/constants/defaults.constants.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// exporters
import { exportChatGPT } from './exporter/chatgpt-exporter.ts';
import { exportClaude } from './exporter/claude-exporter.ts';
import { exportCodex } from './exporter/codex-exporter.ts';
// constants
import { DEFAULT_EXPORT_CONFIG } from './constants/defaults.constants.ts';
// types
import type { ExportConfig, ParsedConfig } from './types/export-config.types.ts';
import type { ExportResult } from './types/export-result.types.ts';

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/** export-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgSchema<ParsedConfig> = [
  { option: '--export-dir', field: 'exportDir', type: 'directory' },
];

/**
 * CLI 引数配列から完全な ExportConfig を構築する。
 *
 * 共通ライブラリの `parseArgs`（CLI > GlobalConfig > defaults の優先度で内部マージ済み）が
 * 返す `Partial<ParsedConfig>` を基に、`exportDir` のみ `chatlogsDir + originalLogs` の
 * 導出ロジックを追加で適用する（`exportDir` は defaults に含めずマージするため、
 * CLI・GlobalConfig どちらにも値がない場合のみこの導出が使われる）。
 * 共通スキーマ由来の `--output-dir`（`parsed.outputDir`）はパースは通るが破棄し、
 * `exportDir` の算出には使用しない。
 *
 * - agent 優先順位: CLI > GlobalConfig > defaults
 * - exportDir 優先順位: CLI(--export-dir) > (GlobalConfig.chatlogsDir > DEFAULT_CHATLOGS_DIR) + 'originalLogs'
 * - inputDir 優先順位: CLI(--input-dir) のみ（GlobalConfig 連携なし）
 * - period: CLI 位置引数のみ（GlobalConfig に期間設定なし）
 */
export const buildConfig = (
  args: string[],
  defaults?: ExportConfig,
): ExportConfig => {
  const _defaults = defaults ?? DEFAULT_EXPORT_CONFIG;
  const parsed = parseArgs<ExportConfig>(args, _SCHEMA, _defaults);
  const _chatlogsDir = parsed.chatlogsDir ?? DEFAULT_CHATLOGS_DIR;
  const _exportDir = parsed.exportDir ?? joinPath(_chatlogsDir, DEFAULT_ORIGINAL_LOGS_DIR);
  parsed.exportDir = _exportDir;
  return parsed;
};

// ─────────────────────────────────────────────
// エージェント振り分け
// ─────────────────────────────────────────────

/** `config.agent` に応じてエクスポート処理を実行する関数の型。 */
export type RunExportProvider = (config: ExportConfig) => Promise<ExportResult>;

/**
 * `config.agent` に応じて対応する exporter を実行し、`ExportResult` を返す。
 *
 * - `claude` → `exportClaude`
 * - `codex` → `exportCodex`
 * - `chatgpt` → `exportChatGPT`（`inputDir` が未指定の場合は `ChatlogError` を throw）
 * - 上記以外 → `ChatlogError('InvalidArgs', 'UnsupportedAgent')` を throw
 *
 * @param config `buildConfig()` が構築した `ExportConfig`
 * @returns 実行した exporter の `ExportResult`
 */
export const runExport: RunExportProvider = async (config) => {
  switch (config.agent) {
    case 'claude':
      return await exportClaude(config);
    case 'codex':
      return await exportCodex(config);
    case 'chatgpt':
      if (!config.inputDir) {
        throw new ChatlogError(
          'InvalidArgs',
          'NotSpecified',
          'chatgpt エージェントには入力ディレクトリを指定してください (位置引数または --input-dir)',
        );
      }
      return await exportChatGPT(config);
    default:
      throw new ChatlogError('InvalidArgs', 'UnsupportedAgent', `未対応のエージェント: ${config.agent}`);
  }
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * export-chatlogs スクリプトのエントリポイント。
 *
 * 処理フロー:
 * 1. `buildConfig()` で argv を解析して `ExportConfig` を取得
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
 * @param runExportFn エージェント振り分けを実行する関数。省略時は `runExport`
 */
export const main = async (
  argv?: string[],
  runExportFn: RunExportProvider = runExport,
): Promise<void> => {
  const config = buildConfig(argv ?? Deno.args);
  const { agent, period, exportDir } = config;

  logger.info(`対象 agent: ${agent}`);
  if (period) { logger.info(`対象期間: ${period}`); }

  const result = await runExportFn(config);

  for (const outPath of result.outputPaths) {
    logger.log(outPath);
  }

  const total = result.exportedCount + result.skippedCount + result.errorCount;
  logger.info(
    `\n完了: ${total} 件処理 (出力: ${result.exportedCount} / スキップ: ${result.skippedCount} / エラー: ${result.errorCount}) `,
  );
  logger.info(`出力先: ${exportDir}/${agent}/`);
};

if (import.meta.main) { await main(); }
