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

/** ロガー出力で使う prefix 定数（スペースなし）。呼び出し側で `${PREFIX} ${msg}` の形にスペースを挿入する。 */
export const LOGGER_PREFIX = {
  INFO: '::info::',
  WARN: '::warn::',
  ERROR: '::error::',
  DRYRUN: '<<dry-run>>',
} as const;

export type LoggerPrefixKey = keyof typeof LOGGER_PREFIX;
