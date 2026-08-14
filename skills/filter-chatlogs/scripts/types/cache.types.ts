// src: scripts/types/cache.types.ts
// @(#): filter-chatlogs キャッシュデータ型定義
//       対象: CLEResult
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { FilterDecision } from './filter-decision.const.types.ts';
import type { StripCacheStatus } from './strip-cache-status.const.types.ts';
import type { StripRule } from './strip.types.ts';

/** ChatlogsCache が保存する filter 判定結果。claude CLI が返した raw な判定を保持する。 */
export interface CLEResult {
  /** KEEP、DISCARD、または ERROR（読み込み失敗の記録）の判定（`FILTER_DECISIONS` 参照）。 */
  decision: FilterDecision;
  /** 判定の信頼度スコア（0.0〜1.0）。DISCARD 確定には `discardThreshold` との比較が別途必要。 */
  confidence: number;
  /** 判定理由。 */
  reason: string;
}

/** ChatlogsCache が保存する strip 判定結果。処理済み記録（R-003）の参照元となる。 */
export interface StripCache {
  /** strip の判定結果ステータス（`STRIP_CACHE_STATUSES` 参照）。 */
  status: StripCacheStatus;
  /** 成立した判定規則の識別子（例: `'R-008'`）。 */
  rule: StripRule;
}
