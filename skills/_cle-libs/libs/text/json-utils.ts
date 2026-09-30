// src: skills/_cle-libs/libs/text/json-utils.ts
// @(#): JSON パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `parseAiJsonArray` の任意オプション。 */
export type ParseAiJsonArrayOptions = {
  /** true のとき、直接パース段（段階1）が空配列を成功として返す。既定は false（空配列は失敗扱い）。 */
  allowEmpty?: boolean;
};

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
 * `allowEmpty` が true のときのみ空配列を成功として返す。false のときは段階2 へフォールバックさせる。
 *
 * @param raw - AI 出力テキスト
 * @param allowEmpty - 空配列を成功として返すかどうか
 */
const _parseDirectArray = <T>(raw: string, allowEmpty: boolean): T[] | null => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return _tryParseArray<T>(trimmed, allowEmpty);
  }

  const stripped = _stripCodeFence(raw).trim();
  if (!stripped.startsWith('[')) { return null; }
  return _tryParseArray<T>(stripped, allowEmpty);
};

/**
 * 段階2: non-greedy マッチで最初にパースできた非空配列を返す。
 *
 * `allowEmpty` を受け取らない（散文中の `[]` 誤検出回避）。呼び出し元が `allowEmpty: true` を指定しても
 * この段へは伝播しない。
 */
const _parseFirstBracketMatch = <T>(raw: string): T[] | null => {
  for (const m of raw.matchAll(/\[[\s\S]*?\]/g)) {
    const result = _tryParseArray<T>(m[0]);
    if (result !== null) { return result; }
  }
  return null;
};

/**
 * 段階3: greedy マッチで最長区間をパースして非空配列を返す。
 *
 * 段階2 と同じく `allowEmpty` を受け取らない（散文中の `[]` 誤検出回避）。
 */
const _parseGreedyBracketMatch = <T>(raw: string): T[] | null => {
  const greedy = raw.match(/\[[\s\S]*\]/);
  return greedy ? _tryParseArray<T>(greedy[0]) : null;
};

/**
 * AI 出力から JSON 配列を 3 段階フォールバックで抽出する。
 *
 * 既定（`allowEmpty` 省略）では空配列を成功として扱わない。`'[]'` のみの入力は `null` を返す。
 * `allowEmpty` は直接パース段（段階1）にのみ効き、括弧マッチ段（段階2/3）へは伝播しない。
 * 散文中の `[]` を配列応答と誤認しないための境界であり、`{ allowEmpty: true }` を渡しても
 * `'結果は [] です'` は `null` のままになる。
 *
 * @param raw - AI 出力テキスト
 * @param options - 任意オプション。`allowEmpty` の既定は false
 * @returns 抽出できた配列。抽出できない場合は null
 */
export const parseAiJsonArray = <T>(raw: string, options: ParseAiJsonArrayOptions = {}): T[] | null => {
  const { allowEmpty = false } = options;
  return _parseDirectArray<T>(raw, allowEmpty) ?? _parseFirstBracketMatch<T>(raw) ?? _parseGreedyBracketMatch<T>(raw);
};
