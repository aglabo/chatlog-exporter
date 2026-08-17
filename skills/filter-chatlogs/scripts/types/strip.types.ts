// src: scripts/types/strip.types.ts
// @(#): strip 判定カスケードの結果型定義
//       対象: StripOutcome / StripRule / StripReason / StripDecision
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * strip 判定の分類結果。
 *
 * 5 値すべてが `StripStats` の同名フィールドへ 1 対 1 で対応する（`total` を除く 5 種。DR-30）。
 * `_applyFileOutcome` は分類名と同名のフィールドを加算するだけでよく、対応表を要しない。
 *
 * `skipped` は dry-run で「除去対象だが書き込みを見送った」ことを表す。通常実行では
 * `skipped` が、dry-run では `stripped` が常に 0 となり、両者は排他になる。
 */
export type StripOutcome = 'stripped' | 'done' | 'passthrough' | 'error' | 'skipped';

/** 判定カスケードで成立しうる規則の識別子（specifications.md Section 4.2）。 */
export type StripRule = 'R-002' | 'R-003' | 'R-004' | 'R-005' | 'R-006' | 'R-007' | 'R-008';

/**
 * 判定が成立した理由。規則 ID を担ぐ判別可能ユニオン。
 *
 * R-002 は「frontmatter 欠落」と「I/O エラー」の 2 事象を含む。DR-21 決定 2 により規則 ID は
 * 同一だが、I/O エラー時のみ `ChatlogError` の `kind` / `subindex` と対象パスを担ぐ。
 * R-004 も退避存在確認が I/O エラーになった場合に同じ付随情報を担ぐ（DD-03: 個別ファイルの
 * 異常で実行全体を中断させない）。`'kind' in reason` で付随情報の有無を判別する。
 */
export type StripReason =
  | { rule: Exclude<StripRule, 'R-002'> }
  | { rule: 'R-002' }
  | { rule: 'R-002' | 'R-004'; kind: string; subindex: string; path: string };

/**
 * 判定カスケードの結果。
 *
 * 行番号は**ファイル全体**基準（frontmatter の行を含む）、
 * バイト数は**本文**基準（frontmatter を除外）で算出する（基準が異なる点に注意）。
 *
 * 除去範囲を持つのは `stripped` と `skipped` の 2 種である。`skipped` は dry-run で書き込みを
 * 見送っただけであり、除去範囲そのものは確定しているため `stripped` と**同じ実値**を担ぐ。
 * `-1` / `0` に潰すと dry-run 明細から除去範囲が失われ、事前レビューが成立しない。
 * `done` / `passthrough` / `error` は除去範囲が存在しないため `-1` / `-1` / `0` を返す。
 */
export interface StripDecision {
  /** 判定の分類結果。 */
  outcome: StripOutcome;
  /** 成立した規則とその付随情報。 */
  reason: StripReason;
  /** 除去開始行（ファイル全体基準、0 起点）。除去範囲を持たない分類では `-1`。 */
  removalStartLine: number;
  /** 除去終了行（ファイル全体基準、0 起点、境界見出しの直前行）。除去範囲を持たない分類では `-1`。 */
  removalEndLine: number;
  /** 除去範囲の UTF-8 バイト数。除去範囲を持たない分類では `0`。 */
  removedBytes: number;
  /**
   * 除去前の**本文**（frontmatter を除く）全体の UTF-8 バイト数。除去範囲を持たない分類では `0`。
   *
   * `removedBytes` と同じ本文基準で算出し、REQ-F-006 の「除去前後の合計バイト数」の
   * 除去前側を担う（除去後は `contentBytes - removedBytes`）。
   *
   * 実値を持つのは R-008 に到達した `stripped` / `skipped` のみである。本文の分割
   * （`divideEntry`）は R-005 の直前まで行われないため、R-002（読み取り失敗・frontmatter 欠落）
   * では本文自体が得られず、R-003 / R-004（`done`）では本文を読む前に判定が確定する。
   * すなわち全分類を対象とした本文バイト数は原理的に算出できない。
   */
  contentBytes: number;
}
