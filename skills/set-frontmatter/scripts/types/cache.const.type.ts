// src: scripts/types/cache.const.type.ts
// @(#): set-frontmatter キャッシュ status 進捗段階定数と派生型定義
//       対象: SetfmCacheStatus
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

/** set-frontmatter キャッシュの status 識別子。処理の到達段階を表す。 */
export const SETFM_CACHE_STATUSES = {
  EMPTY: '', // 未着手
  TYPE_CATEGORY: 'type-category', // Phase 2.1 完了（旧 set-types）
  FRONTMATTER: 'frontmatter', // Phase 2.2 完了（旧 need-review）
  REVIEWED: 'reviewed', // Phase 3.1 完了
  WRITTEN: 'written', // Phase 4.1 完了
  REVIEW_FAILED: 'review-failed', // review 失敗
} as const;

/** `SETFM_CACHE_STATUSES` の値から派生したユニオン型。`'' | 'type-category' | 'frontmatter' | 'reviewed' | 'written' | 'review-failed'` と等価。 */
export type SetfmCacheStatus = typeof SETFM_CACHE_STATUSES[keyof typeof SETFM_CACHE_STATUSES];
