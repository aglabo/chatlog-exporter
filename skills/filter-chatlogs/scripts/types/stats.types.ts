// src: scripts/types/stats.types.ts
// @(#): filter-chatlogs 統計カウンター型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** filter-chatlogs / prefilter-chatlogs に共通する統計カウンターフィールド。 */
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

/** prefilter 処理の統計情報。 */
export interface PrefilterStats extends BaseStats {}
