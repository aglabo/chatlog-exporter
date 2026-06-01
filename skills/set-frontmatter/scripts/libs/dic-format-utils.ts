// src: scripts/libs/dic-format-utils.ts
// @(#): set-frontmatter 辞書エントリ整形ユーティリティ
//       対象: formatEntryWithRules / formatEntryShort
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local
// types
import type { DicEntry } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// 辞書エントリをプロンプト文字列に整形するヘルパー
// ─────────────────────────────────────────────

/** エントリを「- key: def\n  <rule-key>: ...\n  structure: ...」形式に展開 */
export const formatEntryWithRules = (e: DicEntry): string => {
  const lines: string[] = [`- ${e.key}: ${e.def}`];
  Object.entries(e.rules)
    .filter(([, vals]) => vals.length > 0)
    .forEach(([k, vals]) => lines.push(`  ${k}: ${vals.join(' / ')}`));
  if (e.structure) {
    lines.push(`  structure: ${e.structure}`);
  }
  return lines.join('\n');
};

/** エントリを「- key: def」形式に展開（rules なし・簡略版） */
export const formatEntryShort = (e: DicEntry): string => {
  return `- ${e.key}: ${e.def}`;
};
