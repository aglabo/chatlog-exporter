// src: scripts/types/filter.types.ts
// @(#): filter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { FilterDecision } from './filter-decision.const.types.ts';

// ─────────────────────────────────────────────
// 分類設定型
// ─────────────────────────────────────────────

/** `main` が使用するフィルタ処理の設定。すべてのフィールドに値が入る。 */
export interface FilterConfig {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** 対象年月（`YYYY-MM` 形式）。省略時は全期間。 */
  period?: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** 入力ディレクトリのフルパス直接指定。指定時は agent/period を無視してこのパスをそのまま使う。 */
  inputDir?: string;

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
export type FilterParsedConfig = Partial<FilterConfig> & {
  /** `--config` で指定された設定ファイルのパス。省略時は `undefined`。 */
  configFile?: string;
};

// ─────────────────────────────────────────────
// Claude CLI 判定結果型
// ─────────────────────────────────────────────

/** Claude CLI が返すファイル単位の判定結果。 */
export interface ClaudeResult {
  file: string;
  decision: FilterDecision;
  confidence: number;
  reason: string;
}

// ─────────────────────────────────────────────
// prefilterFiles オプション型
// ─────────────────────────────────────────────

/** 削除確定ファイル。バッチ削除の入力単位。 */
export interface DiscardFile {
  filePath: string;
  filename: string;
  /** 削除理由（cache への DISCARD reason 書き込み・ログ出力に使用）。 */
  reason: string;
  /** 区別用の判定種別。ファイル名パターン除外は `FILTER_DECISIONS.DISCARD`、Phase2 読み込み失敗は `FILTER_DECISIONS.ERROR`。 */
  decision: FilterDecision;
}

/** ノイズフィルタ処理関数（prefilterFiles / processNoiseFiles）共通のオプション引数。 */
export interface FilterProcessOptions {
  /** `true` のとき、削除対象ファイルを実削除せず `stats.skip` に計上する。 */
  dryRun: boolean;
  /** 同時実行する削除処理の最大並列数。 */
  concurrency: number;
}

/** `prefilterFiles` のオプション引数。 */
export interface PrefilterFilesOptions extends FilterProcessOptions {
  /** 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）。 */
  minCharCount?: number;
  /** User ターン 1 件時の Assistant 応答最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）。 */
  minAssistantChars?: number;
}
