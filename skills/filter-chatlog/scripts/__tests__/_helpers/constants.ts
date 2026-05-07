// src: scripts/__tests__/_helpers/constants.ts
// @(#): filter-chatlog E2E テスト共通定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** filter-chatlog の KEEP 判定を通過する最小テキスト長（文字数）。 */
export const FILTER_MIN_CONTENT_LENGTH = 500;

/** prefilter-chatlog のコンテンツフィルタを通過する最小テキスト長（文字数）。 */
export const PREFILTER_MIN_CONTENT_LENGTH = 300;

/** MAX_BODY_CHARS（8000）を大幅に超える本文長。切り詰めメカニズムの検証に使用する。 */
export const OVER_MAX_CHARS_LENGTH = 20000;

/** MAX_BODY_CHARS（8000）＋ヘッダーオーバーヘッド分を加えた結果長の上限。本文切り詰め後のプロンプト全体長の検証に使用する。 */
export const MAX_PROMPT_LENGTH = 10000;
