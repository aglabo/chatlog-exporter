// src: scripts/types/stats.types.ts
// @(#): filter-chatlogs 統計カウンター型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** filter-chatlogs / noise-filter-chatlogs に共通する統計カウンターフィールド。 */
export interface BaseStats {
  /** 保存確定数（AI判定でKEEP、または事前段階で対象外と確定したもの）。 */
  keep: number;
  /** dry-run/report 等により判定・削除の実行自体を行わなかった数。 */
  skip: number;
  /** 判定により削除が実行された数。 */
  remove: number;
  /** 読み取りエラーや削除失敗が発生したファイル数。 */
  error: number;
}

/** バッチ処理全体の処理統計。 */
export interface FilterStats extends BaseStats {}

/** noise-filter 処理の統計情報。 */
export interface NoiseFilterStats extends BaseStats {}

/**
 * strip 処理の統計情報。
 *
 * `BaseStats` を継承しない独立定義とする。`BaseStats.skip` はモード依存の意味を持ち、
 * strip の `done`（既処理・退避済みのため対象外）と衝突するため（DR-15）。
 */
export interface StripStats {
  /** 判定対象となったファイルの総数。 */
  total: number;
  /** 定型部の除去が行われた件数。 */
  stripped: number;
  /** dry-run のため書き込みを見送った件数（通常実行では常に 0。DR-30）。 */
  skipped: number;
  /** 既に処理済み（キャッシュ記録あり、または退避ファイル存在）で対象外とした件数。 */
  done: number;
  /** 除去対象を持たず、そのまま通過させた件数。 */
  passthrough: number;
  /** frontmatter 欠落・I/O エラー・安全弁の発動により除去を行わなかった件数。 */
  error: number;
  /**
   * 除去前の合計バイト数（REQ-F-006）。
   *
   * 集計対象は**分類**が `stripped`（通常実行）/ `skipped`（dry-run）のファイルに限る。
   * 除去を行わない分類（`done` / `passthrough` / `error`）は本文バイト数を持たない
   * （`StripDecision.contentBytes` 参照）。
   *
   * 値は本文（frontmatter を除く）の UTF-8 バイト数の合計であり、ファイルサイズではない。
   */
  bytesBefore: number;
  /**
   * 除去後の合計バイト数（REQ-F-006）。`bytesBefore` から除去範囲のバイト数を差し引いた値。
   *
   * 除去範囲のバイト数（`StripDecision.removedBytes`）は除去範囲最終行の行末終端子を含まないため、
   * 実ファイルの縮小量とは除去 1 件あたり行区切り 1 バイト分だけ異なる。
   */
  bytesAfter: number;
}

/**
 * strip 復帰専用モード（R-015）の統計情報。
 *
 * `StripStats` とは分類軸が異なる（判定を行わないため stripped/done/passthrough を持たない）ため
 * 独立定義とする。`BaseStats` も継承しない（`BaseStats.skip` とは意味が異なるため。DR-15 と同じ理由）。
 *
 * dry-run では `recovered` と `skipped` が同数になる。`recovered` は復帰「予定」件数を表し、
 * dry-run は実行前レビューの手段であるため、この件数は実行時の `recovered` と一致しなければならない。
 * `skipped` は実際には復帰を行わなかった件数を表す。
 */
export interface RecoverStats {
  /** 本体名へ復帰させた件数（dry-run では復帰予定件数）。 */
  recovered: number;
  /** dry-run のため実際には復帰を行わなかった件数（通常実行では常に 0）。 */
  skipped: number;
  /** 復帰リネームに失敗した件数、および復帰後のキャッシュ削除に失敗した件数（DR-24）。 */
  error: number;
}
