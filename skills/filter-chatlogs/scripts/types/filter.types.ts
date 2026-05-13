// src: scripts/types/filter.types.ts
// @(#): filter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// 分類設定型
// ─────────────────────────────────────────────

/** `main` が使用するフィルタ処理の設定。すべてのフィールドに値が入る。 */
export interface FilterConfig {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** 対象年月（`YYYY-MM` 形式）。省略時は全期間。 */
  period?: string;
  /** チャットログ基底ディレクトリのパス。GlobalConfig の chatlogsDir を CLI で上書きする。省略時は `undefined`。 */
  baseDir?: string;
  /** チャットログ最終探索パス直接指定。省略時は `undefined`。 */
  chatlogsDir?: string;

  // flags
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;

  // config.yaml only
  /** バッチ処理 1 回あたりの最大ファイル数。 */
  chunkSize: number;
  /** 同時実行する claude CLI プロセスの最大並列数。 */
  concurrency: number;
  /** コンテンツ最小文字数フィルタ閾値。 */
  minCharCount: number;
  /** Assistant 応答最小文字数閾値（userTurns=1 時）。 */
  minAssistantChars: number;
  /** DISCARD 判定に必要な最低信頼度スコア。 */
  discardThreshold: number;
}

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type ParsedConfig = Partial<FilterConfig> & {
  /** `--config` で指定された設定ファイルのパス。省略時は `undefined`。 */
  configFile?: string;
};

// ─────────────────────────────────────────────
// Claude CLI 判定結果型
// ─────────────────────────────────────────────

/** Claude CLI が返すファイル単位の判定結果。 */
export interface ClaudeResult {
  file: string;
  decision: 'KEEP' | 'DISCARD';
  confidence: number;
  reason: string;
}

/** バッチ処理全体の処理統計。 */
export interface Stats {
  kept: number;
  discarded: number;
  skipped: number;
  preSkipped: number;
  error: number;
}
