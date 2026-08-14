// src: scripts/types/strip-cache-status.const.types.ts
// @(#): strip キャッシュエントリのステータス識別子定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * strip キャッシュエントリのステータス識別子。`StripCacheStatus` のリテラル直書きを置き換える。
 *
 * `_cle-libs` の `CACHE_STATUSES` と同じ `as const` + 派生 union の形を採るが、
 * strip 固有のステータスであり `ChatlogCache<T>` は generic で strip を知る必要が無いため
 * filter スキル内に置く。
 */
export const STRIP_CACHE_STATUSES = {
  STRIPPED: 'stripped',
  DONE: 'done',
  PASSTHROUGH: 'passthrough',
  ERROR: 'error',
  EMPTY: '',
} as const;

/** `STRIP_CACHE_STATUSES` の値から派生したユニオン型。`'stripped' | 'done' | 'passthrough' | 'error' | ''` と等価。 */
export type StripCacheStatus = typeof STRIP_CACHE_STATUSES[keyof typeof STRIP_CACHE_STATUSES];
