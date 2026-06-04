// src: scripts/libs/dic-format-utils.ts
// @(#): set-frontmatter 辞書エントリ整形ユーティリティ
//       対象: formatDicEntry / formatDicEntryShort / formatDicEntries / formatDicEntriesShort
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

/** エントリを「- key: def\n  desc: ...\n  <rule-key>: ...\n  structure: ...\n」形式に展開（末尾改行付き） */
export const formatDicEntry = (e: DicEntry): string => {
  const lines: string[] = [`- ${e.key}: ${e.def}`];
  if (e.desc) {
    lines.push(`  desc: ${e.desc}`);
  }
  Object.entries(e.rules)
    .filter(([, vals]) => vals.length > 0)
    .forEach(([k, vals]) => lines.push(`  ${k}: ${vals.join(' / ')}`));
  if (e.structure) {
    lines.push(`  structure: ${e.structure}`);
  }
  return lines.join('\n') + '\n';
};

/** エントリを「- key: def」形式に展開（rules なし・簡略版） */
export const formatDicEntryShort = (e: DicEntry): string => {
  return `- ${e.key}: ${e.def}`;
};

/** 複数の辞書エントリを formatDicEntry で整形し、改行で結合した文字列を返す。 */
export const formatDicEntries = (entries: DicEntry[]): string => entries.map(formatDicEntry).join('\n');

/** 複数の辞書エントリを formatDicEntryShort で整形し、改行で結合した文字列を返す。 */
export const formatDicEntriesShort = (entries: DicEntry[]): string => entries.map(formatDicEntryShort).join('\n');
