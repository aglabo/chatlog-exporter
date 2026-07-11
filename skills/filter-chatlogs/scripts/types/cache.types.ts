// src: scripts/types/cache.types.ts
// @(#): filter-chatlogs キャッシュデータ型定義
//       対象: CLEResult
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { FilterDecision } from './filter-decision.const.types.ts';

/** ChatlogsCache が保存する filter 判定結果。claude CLI が返した raw な判定を保持する。 */
export interface CLEResult {
  /** KEEP、DISCARD、または ERROR（読み込み失敗の記録）の判定（`FILTER_DECISIONS` 参照）。 */
  decision: FilterDecision;
  /** 判定の信頼度スコア（0.0〜1.0）。DISCARD 確定には `discardThreshold` との比較が別途必要。 */
  confidence: number;
  /** 判定理由。 */
  reason: string;
}
