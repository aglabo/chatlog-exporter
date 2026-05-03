// src: scripts/libs/skip-rules.ts
// @(#): チャットログスキップ判定ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Internal modules ───────────────────────────────────────────────────────
// constants
import {
  SESSION_SKIP_KEYWORDS,
  SESSION_SKIP_KEYWORDS_HEAD_LINES,
  SHORT_AFFIRMATION_MAX_LEN,
  SKIP_EXACT,
  SKIP_PREFIXES,
} from '../constants/skip-rules.constants.ts';

/** テキストが短文肯定応答（"yes", "はい", "ok" 等）かどうかを判定する。 */
export const isShortAffirmation = (text: string): boolean => {
  return text.length <= SHORT_AFFIRMATION_MAX_LEN && SKIP_EXACT.has(text.trim().toLowerCase());
};

/** ユーザー入力テキストをチャットログから除外すべきか判定する。 */
export const isSkippable = (text: string): boolean => {
  if (!text) { return true; }
  if (SKIP_PREFIXES.some((p) => text.startsWith(p))) { return true; }
  if (isShortAffirmation(text)) { return true; }
  return false;
};

/** セッションの最初のユーザーテキストにスキップキーワードが含まれるか判定する。 */
export const isSkippableSession = (firstUserText: string): boolean => {
  const headLines = firstUserText.split('\n').slice(0, SESSION_SKIP_KEYWORDS_HEAD_LINES);
  const hasYamlKeyword = headLines.some((line) => {
    const match = line.match(/^(?:name|title)\s*:\s*(.+)$/i);
    if (!match) { return false; }
    const value = match[1].toLowerCase();
    return SESSION_SKIP_KEYWORDS.some((keyword) => value.includes(keyword.toLowerCase()));
  });
  if (hasYamlKeyword) { return true; }
  const headText = headLines.join('\n').toLowerCase();
  return SESSION_SKIP_KEYWORDS.some((keyword) => headText.includes(keyword.toLowerCase()));
};
