// src: scripts/types/strip-removal-kind.const.types.ts
// @(#): strip 判定が確定した除去範囲の種別識別子定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * `StripDecision` が担ぐ除去範囲の種別。`removalKind` のリテラル直書きを置き換える。
 *
 * 判定カスケードは除去範囲を 2 つの経路から確定させる。R-006（頭部の定型部マーカー）が
 * 成立した場合は `HEAD`、R-018（`## Excerpt` 直後の貼り付け前置き区間）が成立した場合は
 * `PASTE` になる。両者は排他であり、R-006 が優先する（DR-41 決定 2）。
 *
 * 除去範囲を持たない分類（`done` / `passthrough` / `error`）は `NONE` を担ぐ。
 * 書き込み側は種別ごとに除去の当て方が異なるため、行番号だけでは経路を復元できない。
 *
 * `STRIP_CACHE_STATUSES` と同じ `as const` + 派生 union の形を採る。
 */
export const STRIP_REMOVAL_KINDS = {
  HEAD: 'head',
  PASTE: 'paste',
  NONE: 'none',
} as const;

/** `STRIP_REMOVAL_KINDS` の値から派生したユニオン型。`'head' | 'paste' | 'none'` と等価。 */
export type StripRemovalKind = typeof STRIP_REMOVAL_KINDS[keyof typeof STRIP_REMOVAL_KINDS];
