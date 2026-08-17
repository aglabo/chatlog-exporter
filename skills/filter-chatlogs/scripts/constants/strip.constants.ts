// src: scripts/constants/strip.constants.ts
// @(#): strip 処理の境界検出・安全弁・再試行に用いる定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// strip 境界検出定数
// ─────────────────────────────────────────────

/** strip の除去境界となる見出し行（行頭完全一致で判定する）。 */
export const STRIP_BOUNDARY_HEADING = '## Summary';

/** 定型部の存在を示すマーカー行（行頭完全一致で判定する）。 */
export const STRIP_TEMPLATE_MARKER = '## TOPICS ASSIGNMENT RULES';

// ─────────────────────────────────────────────
// strip 安全弁定数
// ─────────────────────────────────────────────

/** 除去率の上限。本文に対する除去バイト数の比がこれを超える場合、安全弁 R-007 により error とする。 */
export const STRIP_MAX_REMOVAL_RATE = 0.99;

// ─────────────────────────────────────────────
// strip 再試行定数
// ─────────────────────────────────────────────

/** 復帰後のキャッシュ削除の最大試行回数。一時的なファイルロックを想定した固定 2 回とする（DR-27）。 */
export const STRIP_CACHE_DELETE_ATTEMPTS = 2;

/** キャッシュ削除の再試行前に挟む待機時間（ミリ秒）。最終試行の後には待機しない（DR-27）。 */
export const STRIP_CACHE_DELETE_RETRY_WAIT_MS = 100;
