// src: scripts/types/phase.types.ts
// @(#): set-frontmatter フェーズ処理関連型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { FrontmatterFields } from '../../../_cle-libs/types/frontmatter.types.ts';

// ─────────────────────────────────────────────
// フェーズ結果型
// ─────────────────────────────────────────────

/** チャットログの種別を表す文字列型。辞書の `key` フィールドの値が入る。 */
export type LogType = string;

/** レビューフェーズ（Phase 3.5）の1ファイル分の結果。 */
export interface ReviewResult {
  /** レビュー判定結果。`'pass'`: 修正不要, `'corrected'`: AI が修正あり, `'error'`: レビュー不可。 */
  validity: 'pass' | 'corrected' | 'error';
  /** `validity === 'corrected'` または `'error'` のときのエラーメッセージ一覧。 */
  errors: string[];
  /** `validity === 'corrected'` のときのみ存在。AI が提案した修正後フロントマターフィールド。 */
  corrected?: FrontmatterFields;
}

// ─────────────────────────────────────────────
// 処理統計型
// ─────────────────────────────────────────────

/** 処理全体の集計カウンター。`main` 関数が完了時に出力する。 */
export interface Stats {
  /** 処理対象ファイルの総数。 */
  total: number;
  /** フロントマターの書き込みに成功したファイル数。 */
  success: number;
  /** 処理に失敗したファイル数（AI エラー・書き込みエラー等）。 */
  fail: number;
  /** スキップされたファイル数（dryRun 等）。 */
  skip: number;
  /** `status === 'written'` でフィルタされたファイル数（outputDir 書き込み済み）。 */
  written: number;
}
