// src: skills/_scripts/libs/text/string-utils.ts
// @(#): 基本文字列ユーティリティ（型変換・エスケープ・クォート）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

export const toStringWithNull = (v: unknown): string => {
  if (v == null) { return ''; }
  if (typeof v === 'string') { return v; }
  return String(v);
};

/** unknown が string ならそのまま返し、undefined は undefined を返す。null は "" を返す。それ以外は TypeError をスローする。 */
export const parseString = (value: unknown): string | undefined => {
  if (value === undefined) { return undefined; }
  if (value === null) { return ''; }
  if (typeof value !== 'string') {
    throw new TypeError(`Unsupported type: ${typeof value}`);
  }
  return value;
};

/** unknown を number に変換して返す。null/undefined は undefined を返す。変換不能な型・値は TypeError をスローする。 */
export const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') { return value; }
  if (value == null) { return undefined; }
  if (typeof value !== 'string') {
    throw new TypeError(`Unsupported type: ${typeof value}`);
  }
  const _cleaned = value.replace(/_/g, '');
  if (_cleaned === '') { return undefined; }
  const _parsed = Number(_cleaned);
  if (Number.isNaN(_parsed)) { throw new TypeError(`Cannot convert to number: ${value}`); }
  return _parsed;
};

export const toStringArrayWithNull = (v: unknown): string[] => {
  if (!Array.isArray(v)) { return []; }
  return v.map(String);
};

/** `"` で囲む前処理として `\` → `\\`、`"` → `\"` にエスケープする。 */
export const escapeString = (s: string): string => {
  return s.replace(/[\\"]/g, (c) => '\\' + c);
};

/** 文字列を指定のクォート文字（`"`, `'`, `` ` ``）で囲む。quote を省略すると `'` を使用する。`"` の場合は内部の `\` と `"` をエスケープする。 */
export const quoteString = (s: string, quote: string = "'"): string => {
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    throw new Error(`Invalid quote character: ${quote}`);
  }
  const _inner = quote === '"' ? escapeString(s) : s;
  return `${quote}${_inner}${quote}`;
};
