// src: _scripts/constants/logger.constants.ts
// @(#): ロガー出力用共通定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** ロガー出力で使うテキスト定数（インデント等）。 */
export const LOGGER_TEXT = {
  /** ログ出力でネストした状態を表す際に使うインデント（半角スペース2つ）。 */
  INDENT: '  ',
} as const;

export type LoggerTextKey = keyof typeof LOGGER_TEXT;
