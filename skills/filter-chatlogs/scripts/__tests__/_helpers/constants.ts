// src: scripts/__tests__/_helpers/constants.ts
// @(#): filter-chatlogs E2E テスト共通定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Helpers
// constants
import { MAX_BODY_CHARS } from '../../constants/common.constants.ts';

/** filter-chatlogs の KEEP 判定を通過する最小テキスト長（文字数）。 */
export const FILTER_MIN_CONTENT_LENGTH = 500;

/** prefilter-chatlogs のコンテンツフィルタを通過する最小テキスト長（文字数）。 */
export const PREFILTER_MIN_CONTENT_LENGTH = 300;

/** MAX_BODY_CHARS（8000）を大幅に超える本文長。切り詰めメカニズムの検証に使用する。 */
export const OVER_MAX_CHARS_LENGTH = 20000;

/** MAX_BODY_CHARS ＋ヘッダーオーバーヘッド (+2000) を加えた結果長の上限。本文切り詰め後のプロンプト全体長の検証に使用する。 */
export const MAX_PROMPT_LENGTH = MAX_BODY_CHARS + 2000;

/** filter-chatlogs の CHUNK_SIZE（実運用での最大バッチサイズ）。境界値テストに使用する。 */
export const CHUNK_SIZE = 10;
