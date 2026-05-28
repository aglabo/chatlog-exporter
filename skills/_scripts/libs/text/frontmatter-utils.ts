// src: skills/_scripts/libs/text/frontmatter-utils.ts
// @(#): Frontmatter パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// YAML テキストをパースする (@std/yaml)
import { parse as parseYaml } from '@std/yaml';
// YAML テキストを生成する (yaml npm パッケージ)
import { stringify } from 'yaml';

// unknown → string 変換ユーティリティ
import { FRONTMATTER_DELIMITER } from '../../constants/common.constants.ts';
import { normalizeLine } from './line-utils.ts';
import { toStringWithNull } from './string-utils.ts';

import type { FrontmatterEntries, FrontmatterResult } from '../../types/frontmatter.types.ts';

/** frontmatter ブロック抽出の中間結果（内部使用）。 */
type _BlockResult = {
  /** フロントマター区切り内の YAML テキスト。 */
  yamlText: string;
  /** フロントマター終端のバイトオフセット。 */
  frontmatterEnd: number;
};

/** 正規化済みテキストから frontmatter ブロックを抽出する。見つからない場合は null を返す。 */
const _extractBlock = (normalized: string): _BlockResult | null => {
  const _lines = normalized.split('\n');
  if (_lines[0] !== FRONTMATTER_DELIMITER) { return null; }

  const _closeIdx = _lines.indexOf(FRONTMATTER_DELIMITER, 1);
  // 閉じ --- の後に必ず改行が必要（末尾が --- で終わる場合は不正）
  if (_closeIdx === -1 || _closeIdx === _lines.length - 1) { return null; }

  const _yamlLines = _lines.slice(1, _closeIdx);
  return {
    yamlText: _yamlLines.join('\n'),
    frontmatterEnd: [FRONTMATTER_DELIMITER, ..._yamlLines, FRONTMATTER_DELIMITER, ''].join('\n').length,
  };
};

/** unknown 値を文字列に変換する。Date は YYYY-MM-DD 形式。 */
const _unknownToString = (v: unknown): string => {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return toStringWithNull(v);
};

/** unknown 値を string または string[] に変換する。配列要素は各要素を string 化。 */
const _unknownToStringOrArray = (v: unknown): string | string[] => {
  if (Array.isArray(v)) {
    return v.map((item) => _unknownToString(item));
  }
  return _unknownToString(v);
};

/**
 * `entries` を `fieldOrder` の順に並べ、空値を除いた Record を返す。
 *
 * `fieldOrder` の順に走査し、`undefined`・空文字列・空配列の値はスキップする。
 * `fieldOrder` に重複があっても 1 回だけ出力する。
 *
 * @param entries - 並べ替え元の Record
 * @param fieldOrder - 出力フィールドの順序
 * @returns `fieldOrder` の順に並んだ `Record<string, string | string[]>`
 */
export const reorderFrontmatterEntries = (
  entries: Record<string, string | string[]>,
  fieldOrder: string[],
): Record<string, string | string[]> => {
  const _result: Record<string, string | string[]> = {};
  const _seen = new Set<string>();
  for (const field of fieldOrder) {
    if (_seen.has(field)) { continue; }
    _seen.add(field);
    const value = entries[field];
    if (value === undefined) { continue; }
    if (typeof value === 'string' && value === '') { continue; }
    if (Array.isArray(value) && value.length === 0) { continue; }
    _result[field] = value;
  }
  return _result;
};

/** Markdown テキストから frontmatter を抽出してパースする。 */
export const parseFrontmatter = (text: string): FrontmatterResult => {
  const _normalized = normalizeLine(text);
  const _failure: FrontmatterResult = { meta: {}, content: text };

  const _block = _extractBlock(_normalized);
  if (_block === null) { return _failure; }

  let _parsed: unknown;
  try {
    _parsed = parseYaml(_block.yamlText);
  } catch {
    return _failure;
  }

  const _meta = (_parsed !== null && _parsed !== undefined && typeof _parsed === 'object' && !Array.isArray(_parsed))
    ? (_parsed as Record<string, unknown>)
    : {};

  return {
    meta: _meta,
    content: _normalized.slice(_block.frontmatterEnd),
  };
};

/** Markdown テキストから frontmatter を抽出し、文字列または文字列配列に変換して返す。 */
export const parseFrontmatterEntries = (text: string): FrontmatterEntries => {
  const { meta, content } = parseFrontmatter(text);
  const _typedMeta: Record<string, string | string[]> = {};
  for (const key of Object.keys(meta)) {
    _typedMeta[key] = _unknownToStringOrArray(meta[key]);
  }
  return { meta: _typedMeta, content };
};

/**
 * `Record<string, unknown>` を YAML frontmatter ブロック文字列に変換する。
 *
 * - `fields` が空のとき → `""` を返す（frontmatter ブロックを生成しない）
 * - すべての文字列値はダブルクォートで囲まれる
 * - 戻り値は `"---\n{yaml_body}---\n"` の形式（`---` セパレータと末尾改行を含む）
 *
 * @param fields - frontmatter フィールドの Record
 * @returns frontmatter ブロック文字列（空オブジェクトのとき `""`）
 */
export const renderFrontmatter = (fields: Record<string, unknown>): string => {
  if (Object.keys(fields).length === 0) { return ''; }
  const _yamlBody = stringify(fields, { defaultKeyType: 'PLAIN', defaultStringType: 'QUOTE_DOUBLE', lineWidth: 0 });
  return `---\n${_yamlBody}---\n`;
};
