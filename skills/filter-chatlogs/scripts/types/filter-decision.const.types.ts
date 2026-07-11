// src: scripts/types/filter-decision.const.types.ts
// @(#): Claude CLI 判定結果の識別子定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** Claude CLI が返す判定識別子。`FilterDecision` のリテラル直書きを置き換える。 */
export const FILTER_DECISIONS = {
  KEEP: 'KEEP',
  DISCARD: 'DISCARD',
  ERROR: 'ERROR',
} as const;

/** `FILTER_DECISIONS` の値から派生したユニオン型。`'KEEP' | 'DISCARD'` と等価。 */
export type FilterDecision = typeof FILTER_DECISIONS[keyof typeof FILTER_DECISIONS];
