// src: scripts/types/noise-filter.types.ts
// @(#): noise-filter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';
import type { FilterDecision } from './filter-decision.const.types.ts';

/** `noise-filter-chatlogs` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export type NoiseFilterConfig = DefaultArgFields & {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;
  /** 本文の最小文字数（GlobalConfig の minCharCount 由来）。 */
  minCharCount: number;
  /** User ターンが 1 件のとき、Assistant 応答の最小文字数（GlobalConfig の minAssistantChars 由来）。 */
  minAssistantChars: number;
};

/** `noise-filter-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type NoiseFilterParsedConfig = Partial<NoiseFilterConfig>;

// ─────────────────────────────────────────────
// ノイズ判定確定ファイル型
// ─────────────────────────────────────────────

/** ノイズ判定確定ファイル。`processNoiseFiles` のフェーズ関数間で受け渡す削除対象単位。 */
export interface NoiseDiscardFile {
  filePath: string;
  filename: string;
  /** ノイズ判定理由（`classifyFile`/`classifyConversation` が返す判定理由）。 */
  reason: string;
  /** 区別用の判定種別。ノイズ判定確定は `FILTER_DECISIONS.DISCARD`、読み込み失敗は `FILTER_DECISIONS.ERROR`。 */
  decision: FilterDecision;
}

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** NoiseFilterConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _NoiseFilterConfigCheck = _Assert<NoiseFilterConfig>;
