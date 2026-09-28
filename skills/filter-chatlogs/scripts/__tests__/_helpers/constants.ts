// src: scripts/__tests__/_helpers/constants.ts
// @(#): filter-chatlogs E2E テスト共通定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** filter-chatlogs の KEEP 判定を通過する最小テキスト長（文字数）。 */
export const FILTER_MIN_CONTENT_LENGTH = 500;

/** noise-filter-chatlogs のコンテンツフィルタを通過する最小テキスト長（文字数）。 */
export const NOISE_FILTER_MIN_CONTENT_LENGTH = 300;

/** 本文最大文字数の既定値（8000）を大幅に超える本文長。切り詰めメカニズムの検証に使用する。 */
export const OVER_MAX_CHARS_LENGTH = 20000;

/**
 * 本文切り詰め後のプロンプト全体長の上限（本文 8000 ＋ヘッダーオーバーヘッド 2000）。
 *
 * production の本文最大文字数定数からは**意図的に導出しない**。
 * 定数を参照すると既定値を変えたときにこの期待値も黙って追従し、
 * 既定値の変更がテストに検出されなくなるため、リテラルで固定する。
 */
export const MAX_PROMPT_LENGTH = 10000;

/** filter-chatlogs の CHUNK_SIZE（実運用での最大バッチサイズ）。境界値テストに使用する。 */
export const CHUNK_SIZE = 10;
