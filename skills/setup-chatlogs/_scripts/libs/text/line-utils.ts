// src: skills/_scripts/libs/text/line-utils.ts
// @(#): 行末文字正規化ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 行末文字を LF（`\n`）に統一する（CRLF `\r\n`、CR `\r` → `\n`）。 */
export const normalizeLine = (content: string): string => {
  return content.replace(/\r\n?/g, '\n');
};
