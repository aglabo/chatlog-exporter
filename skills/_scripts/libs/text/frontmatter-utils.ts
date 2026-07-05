// src: skills/_scripts/libs/text/frontmatter-utils.ts
// @(#): Frontmatter パースユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- external
// YAML パース (@std/yaml)
import { parse as parseYaml } from '@std/yaml';

// --- libs
import { normalizeLine } from './line-utils.ts';
import { cleanYaml } from './markdown-utils.ts';
import { toStringWithNull } from './string-utils.ts';
import { stringifyFrontmatter } from './yaml-utils.ts';

// types
import type { FrontmatterEntries, FrontmatterFields, FrontmatterResult } from '../../types/frontmatter.types.ts';
import type { Result } from '../../types/result.types.ts';

// Error
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

// constants
import { FM_FIELD_TYPES, FRONTMATTER_DELIMITER } from '../../constants/common.constants.ts';

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
 * テキストを frontmatter ブロックと本文に分割する。
 *
 * - CRLF を正規化してから処理する
 * - `---\n` で始まらない → `{ frontmatter: '', content: normalized }` を返す（throw しない）
 * - 閉じ `---` なし → `ChatlogError('InvalidFormat', 'NotClosed')` を throw
 * - `@std/yaml` で YAML を検証し、不正 YAML は `ChatlogError('InvalidYaml', 'YamlSyntaxError')` を throw
 * - **既知の制限**: `|1` / `>1` など明示インデント幅指定のブロックスカラーは未サポート（値が失われる場合がある）
 *
 * @param text - 分割対象の入力テキスト
 * @returns `frontmatter` は `---\n...\n---\n` 形式、`content` は閉じ区切り以降の生テキスト
 */
export const divideEntry = (text: string): { frontmatter: string; content: string } => {
  const _normalized = normalizeLine(text).trim();
  const _lines = _normalized.split('\n');

  if (_lines[0] !== FRONTMATTER_DELIMITER) {
    return { frontmatter: '', content: _normalized !== '' ? _normalized + '\n' : '' };
  }

  const _closeIdx = _lines.indexOf(FRONTMATTER_DELIMITER, 1);
  if (_closeIdx === -1) {
    throw new ChatlogError('InvalidFormat', 'NotClosed', 'frontmatter block is not closed');
  }

  // @std/yaml で YAML バリデーション
  const _yamlText = _lines.slice(1, _closeIdx).join('\n');
  if (_yamlText.trim() !== '') {
    try {
      parseYaml(_yamlText);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', detail);
    }
  }

  const _content = _lines.slice(_closeIdx + 1).join('\n');
  return {
    frontmatter: _lines.slice(0, _closeIdx + 1).join('\n') + '\n',
    content: _content !== '' ? _content + '\n' : '',
  };
};

/** Markdown テキストから frontmatter を抽出してパースする。 */
export const parseFrontmatter = (text: string): FrontmatterResult => {
  const _normalized = normalizeLine(text);
  const _failure: FrontmatterResult = { meta: {}, content: text };

  // フロントマターの開始区切りがない場合は早期リターン
  if (!_normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) { return _failure; }

  // divideEntry でフロントマターブロックを分割（NotClosed / YamlSyntaxError は _failure に変換）
  let _divResult: { frontmatter: string; content: string };
  try {
    _divResult = divideEntry(_normalized);
  } catch {
    return _failure;
  }

  // frontmatter が空 → 開き --- のみで閉じ区切りなし
  if (_divResult.frontmatter === '') { return _failure; }

  // frontmatter ブロック（'---\n...\n---\n'）から YAML 部分を抽出してパース
  const _fmLines = _divResult.frontmatter.split('\n');
  const _yamlBody = _fmLines.slice(1, -2).join('\n');
  const _parsed = _yamlBody.trim() !== '' ? parseYaml(_yamlBody) : undefined;
  const _meta = (_parsed !== null && _parsed !== undefined && typeof _parsed === 'object' && !Array.isArray(_parsed))
    ? _parsed as Record<string, unknown>
    : {};

  return { meta: _meta, content: _divResult.content };
};

/** テキストにフロントマターが存在し、かつ1つ以上のフィールドが設定されているか判定する。 */
export const hasFrontmatter = (text: string): boolean => {
  const { meta } = parseFrontmatter(text);
  return Object.keys(meta).length > 0;
};

/**
 * `FrontmatterFields` の必須フィールドがすべて充足しているか判定する。
 *
 * - `string[]` を渡した場合: 全フィールドを `'string'` 型として判定（非空であること）
 * - `Record<string, 'string' | 'array'>` を渡した場合: フィールドごとの期待型で判定
 *   - `'string'`: 非空文字列であること
 *   - `'array'`: 1要素以上の配列であること（スカラー文字列は不充足）
 *
 * @param values - チェック対象のフィールド値を持つ `FrontmatterFields`
 * @param fields - フィールド名リスト、またはフィールド名と期待型のマップ（デフォルト: `FM_FIELD_TYPES`）
 * @returns すべてのフィールドが充足しているとき `true`
 */
export const hasFrontmatterFields = (
  values: FrontmatterFields,
  fields: readonly string[] | Record<string, 'string' | 'array'> = FM_FIELD_TYPES,
): boolean => {
  const _checkField = (expectedType: 'string' | 'array', value: string | string[] | undefined): boolean => {
    if (expectedType === 'array') {
      return Array.isArray(value) && value.length >= 1;
    }
    return typeof value === 'string' && value.length > 0;
  };

  if (Array.isArray(fields)) {
    return fields.every((field) => _checkField('string', values[field]));
  }
  return Object.entries(fields as Record<string, 'string' | 'array'>).every(
    ([field, expectedType]) => _checkField(expectedType, values[field]),
  );
};

/** Markdown テキストから frontmatter を抽出し、文字列または文字列配列に変換して返す。 */
export const parseFrontmatterEntries = (text: string): FrontmatterEntries => {
  const { meta, content } = parseFrontmatter(text);
  const _typedMeta: FrontmatterFields = {};
  for (const key of Object.keys(meta)) {
    _typedMeta[key] = _unknownToStringOrArray(meta[key]);
  }
  return { meta: _typedMeta, content };
};

/**
 * `entries` を `fieldOrder` の順に並べ、空値を除いた Record を返す。
 *
 * `fieldOrder` の順に走査し、`undefined`・空文字列・空配列の値はスキップする。
 * `fieldOrder` に重複があっても 1 回だけ出力する。
 *
 * @param entries - 並べ替え元の Record
 * @param fieldOrder - 出力フィールドの順序
 * @returns `fieldOrder` の順に並んだ `FrontmatterFields`
 */
export const reorderFrontmatterEntries = (
  entries: FrontmatterFields,
  fieldOrder: string[],
): FrontmatterFields => {
  const _result: FrontmatterFields = {};
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
export const renderFrontmatter = (fields: FrontmatterFields): string => {
  if (Object.keys(fields).length === 0) { return ''; }
  const _yamlBody = stringifyFrontmatter(fields);
  return `---\n${_yamlBody}---\n`;
};

/**
 * AI 出力の raw 文字列をクリーニングして YAML パースし、Result 型で返す。
 *
 * - `cleanYaml` でコードフェンス除去・`firstField` 行から抽出する
 * - `cleanYaml` が空文字列を返す場合は `{ ok: false }` を返す
 * - `parseYaml` の結果がオブジェクト以外（null・配列）の場合は `{ ok: false }` を返す
 * - YAML 構文エラーは catch して `{ ok: false }` を返す
 *
 * @param raw - パース対象の生テキスト
 * @param firstField - 抽出開始フィールド名（例: `'title'`, `'validity'`）
 * @returns パース成功時 `{ ok: true, value }` / 失敗時 `{ ok: false, error }`
 */
export const extractYaml = (
  raw: string,
  firstField: string,
): Result<Record<string, unknown>> => {
  const _yaml = cleanYaml(raw, firstField);
  if (!_yaml) {
    return { ok: false, error: new Error('cleanYaml returned empty') };
  }
  try {
    const _result = parseYaml(_yaml);
    if (_result === null || typeof _result !== 'object' || Array.isArray(_result)) {
      return { ok: false, error: new Error('YAML top-level is not an object') };
    }
    return { ok: true, value: _result as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
};
