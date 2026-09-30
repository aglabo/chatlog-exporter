// src: scripts/types/filter.types.ts
// @(#): filter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// classes
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
// types
import type { AiRunnerProvider } from '../../../_cle-libs/types/providers.types.ts';
import type { CLEResult } from './cache.types.ts';
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
  /** `true` のとき chunkSize を強制的に 1 に上書きし、1 ファイルずつ claude CLI に判定させる。 */
  singleFile: boolean;

  // config.yaml only
  /** バッチ処理 1 回あたりの最大ファイル数。 */
  chunkSize: number;
  /** 同時実行する claude CLI プロセスの最大並列数。 */
  concurrency: number;
  /** コンテンツ最小文字数フィルタ閾値。 */
  minCharCount: number;
  /** Assistant 応答最小文字数閾値（userTurns=1 時）。 */
  minAssistantChars: number;
  /** バッチプロンプトへ埋め込む 1 本分の本文の最大文字数（`--max-body-chars` で上書き可能）。 */
  maxBodyChars: number;
  /** DISCARD 判定に必要な最低信頼度スコア。 */
  discardThreshold: number;
  /** 応答の形が不正だったときにチャンクを再要求する最大回数（0=再要求なし、上限 10）。 */
  maxRetry: number;
  /** claude CLI 判定に使用する AI モデル名（例: `sonnet`, `haiku`）。省略時は runAI 側のデフォルトを使用する。 */
  model?: string;
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

// ─────────────────────────────────────────────
// processChunk オプション型
// ─────────────────────────────────────────────

/** `processChunk` のオプション引数。 */
export interface ProcessChunkOptions {
  /** DISCARD 判定に必要な最低信頼度スコア。 */
  discardThreshold: number;
  /** 判定結果の書き込み先キャッシュ（mark-then-sweep のマーク側）。 */
  cache: ChatlogCache<CLEResult>;
  /** 中断制御。中断側 AI エラーでは `abort()` を呼ぶ。 */
  ctl: AbortController;
  /** バッチプロンプトへ埋め込む 1 本分の本文の最大文字数。 */
  maxBodyChars: number;
  /** 応答の形が不正だったときにチャンクを再要求する回数（既定 0、上限 10）。 */
  maxRetry?: number;
  /** 判定に使用する AI モデル名。省略時は `runAI` 側の既定を使う。 */
  model?: string;
  /** AI 実行プロバイダ。既定は `runAI`。テストからの差し替え点。 */
  aiRunnerProvider?: AiRunnerProvider;
}
