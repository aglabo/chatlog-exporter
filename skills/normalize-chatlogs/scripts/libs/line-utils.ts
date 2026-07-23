// src: skills/normalize-chatlogs/scripts/libs/line-utils.ts
// @(#): normalize-chatlogs 行範囲抽出ユーティリティ
//       対象: extractLines
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * Extracts the inclusive line range `[startLine, endLine]` (1-based) from `lines`, clamped to bounds.
 *
 * Used both for the initial AI response (segmentChatlogs) and for re-slicing content from
 * cached `{startLine, endLine}` ranges on resume (process-files phase 4).
 */
export const extractLines = (lines: string[], startLine: number, endLine: number): string => {
  const total = lines.length;
  if (total === 0) { return ''; }
  if (startLine > endLine) { return ''; }
  const start = Math.max(1, Math.min(startLine, total));
  const end = Math.max(start, Math.min(endLine, total));
  return lines.slice(start - 1, end).join('\n');
};
