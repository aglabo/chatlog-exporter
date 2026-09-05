// src: skills/_cle-libs/libs/text/json-utils.ts
// @(#): JSON パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * JSON テキストをパースして配列を返す。パース失敗または配列でない場合は null を返す。
 *
 * @param text - パース対象のテキスト
 * @param allowEmpty - true の場合、空配列も成功として返す。false の場合、空配列は null を返す
 */
const _tryParseArray = <T>(text: string, allowEmpty = false): T[] | null => {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data) && (allowEmpty || data.length > 0)) { return data as T[]; }
  } catch { /* fall through */ }
  return null;
};

/** コードフェンス（\`\`\`json ... \`\`\`）が含まれる場合、内部テキストのみを抽出する。含まれない場合は raw をそのまま返す。 */
const _stripCodeFence = (raw: string): string => {
  const matched = raw.match(/```[^\n]*\n([\s\S]*?)```/);
  return matched ? matched[1] : raw;
};

/**
 * 段階1: 文字列が `[` で始まる場合に直接パースを試みる。`[` で始まらない場合のみコードフェンスを除去して再試行する。
 *
 * 構文的に有効な配列であれば空配列も成功として返す。
 */
const _parseDirectArray = <T>(raw: string): T[] | null => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return _tryParseArray<T>(trimmed, true);
  }

  const stripped = _stripCodeFence(raw).trim();
  if (!stripped.startsWith('[')) { return null; }
  return _tryParseArray<T>(stripped, true);
};

/** 段階2: non-greedy マッチで最初にパースできた非空配列を返す。散文中の `[]` を誤検出しないため空配列は受理しない。 */
const _parseFirstBracketMatch = <T>(raw: string): T[] | null => {
  for (const m of raw.matchAll(/\[[\s\S]*?\]/g)) {
    const result = _tryParseArray<T>(m[0]);
    if (result !== null) { return result; }
  }
  return null;
};

/** 段階3: greedy マッチで最長区間をパースして非空配列を返す。段階2 と同じく空配列は受理しない。 */
const _parseGreedyBracketMatch = <T>(raw: string): T[] | null => {
  const greedy = raw.match(/\[[\s\S]*\]/);
  return greedy ? _tryParseArray<T>(greedy[0]) : null;
};

/** AI 出力から JSON 配列を 3 段階フォールバックで抽出する。 */
export const parseAiJsonArray = <T>(raw: string): T[] | null =>
  _parseDirectArray<T>(raw) ?? _parseFirstBracketMatch<T>(raw) ?? _parseGreedyBracketMatch<T>(raw);
