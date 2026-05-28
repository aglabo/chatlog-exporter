// src: skills/_scripts/libs/text/json-utils.ts
// @(#): JSON パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** AI 出力から JSON 配列を 3 段階フォールバックで抽出する。 */
export const parseAiJsonArray = <T>(raw: string): T[] | null => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data) && data.length > 0) { return data as T[]; }
    } catch { /* fall through */ }
  }
  for (const m of raw.matchAll(/\[[\s\S]*?\]/g)) {
    try {
      const data = JSON.parse(m[0]);
      if (Array.isArray(data) && data.length > 0) { return data as T[]; }
    } catch { /* fall through */ }
  }
  const greedy = raw.match(/\[[\s\S]*\]/);
  if (greedy) {
    try {
      const data = JSON.parse(greedy[0]);
      if (Array.isArray(data) && data.length > 0) { return data as T[]; }
    } catch { /* fall through */ }
  }
  return null;
};
