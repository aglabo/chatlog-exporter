// src: scripts/types/cache.const.type.ts
// @(#): normalize-chatlogs キャッシュデータ型定義
//       対象: NormalizeCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { SegmentPlan } from './normalize.types.ts';

/** キャッシュに保存するセグメント境界。`SegmentPlan` の `title`/`summary`/`startLine`/`endLine`
 * を必須化した形（再分割に使用）。 */
export type CachedSegment = Required<Pick<SegmentPlan, 'title' | 'summary' | 'startLine' | 'endLine'>>;

/** NormalizeCache の status 識別子。'SET': AIがセグメント分割を決定済み（未出力）。'DONE': ファイル出力が完了済み。 */
export const NORMALIZE_CACHE_STATUSES = {
  SET: 'set',
  DONE: 'done',
} as const;

/** `NORMALIZE_CACHE_STATUSES` の値から派生したユニオン型。`'set' | 'done'` と等価。 */
export type NormalizeCacheStatus = typeof NORMALIZE_CACHE_STATUSES[keyof typeof NORMALIZE_CACHE_STATUSES];

/** ChatlogCache が保存する正規化済み判定結果。 */
export interface NormalizeCache {
  /** 'set': AIがセグメント分割を決定済み（未出力）。'done': ファイル出力が完了済み。 */
  status: NormalizeCacheStatus;
  /** AI が決定したセグメント分割設定（再分割に使用）。 */
  segments?: CachedSegment[];
}
