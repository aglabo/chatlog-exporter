// src: skills/_cle-libs/types/cache-status.const.types.ts
// @(#): キャッシュエントリのステータス識別子定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** キャッシュエントリのステータス識別子。`CacheStatus` のリテラル直書きを置き換える。 */
export const CACHE_STATUSES = {
  REVIEWED: 'reviewed',
  WRITTEN: 'written',
  NEED_REVIEW: 'need-review',
  REVIEW_FAILED: 'review-failed',
  SET_TYPES: 'set-types',
  EMPTY: '',
} as const;

/** `CACHE_STATUSES` の値から派生したユニオン型。`'reviewed' | 'written' | 'need-review' | 'review-failed' | ''` と等価。 */
export type CacheStatus = typeof CACHE_STATUSES[keyof typeof CACHE_STATUSES];
