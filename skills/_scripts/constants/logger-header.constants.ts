// src: _scripts/constants/logger-header.constants.ts
// @(#): ロガー出力ヘッダ定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── ロガーメッセージヘッダ定数
export const LOGGER_HEADER = {
  NO_FILE_FOUND: 'No File Found',
} as const;

export type LoggerHeaderKey = keyof typeof LOGGER_HEADER;
