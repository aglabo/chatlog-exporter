// src: skills/_cle-libs/types/json-schema.types.ts
// @(#): 出力契約と json_schema の共通型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// 出力契約
// ─────────────────────────────────────────────

/**
 * 出力契約タグ。復元先の文字列表現を選ぶ（structured-output DR-19 決定 1）。
 *
 * キー集合そのものは契約タグではなく契約定義が決める。
 */
export type OutputContractTag = 'json-array' | 'yaml' | 'line-prefixed';

/**
 * 語彙制約を持つ文字列プロパティの契約定義（structured-output §4.3.1）。
 *
 * 値域 `values` とフォールバック値 `fallback` は `.config/chatlog-exporter/dics/` 配下の辞書から
 * 実行時に読み込まれるため、スキーマ構築側の定数ではなく契約定義として渡す
 * （§4.3.1「辞書由来 enum の扱い」）。`fallback` は `values` の一部でなければならない。
 * 値域の外に置くと「該当なし」を選んだ応答が enum 検証で不適合になる（R-003）。
 */
export type OutputEnumFieldSpec = {
  type: 'string';
  values: string[];
  fallback: string;
};

/**
 * 契約定義のプロパティ 1 件の型。
 *
 * スカラーのほか、`topics` / `tags` のような要素型を持つ配列と、`corrected_frontmatter` の
 * ような入れ子 object を表現できる（§4.3.1）。入れ子 object も内部キーまで定義する。
 *
 * `required` / `additionalProperties` は契約定義ではなくスキーマ構築側の責務のため、
 * object バリアントには現れない（§4.3）。
 */
export type OutputFieldSpec =
  | { type: 'string' | 'number' | 'integer' | 'boolean' }
  | OutputEnumFieldSpec
  | { type: 'array'; items: OutputFieldSpec }
  | { type: 'object'; properties: Record<string, OutputFieldSpec> };

/**
 * 呼び出し元ごとの出力契約（structured-output §4.3.1）。
 *
 * `properties` は契約タグが `json-array` の場合、envelope に包まれる **要素** のプロパティを表す。
 * envelope フィールド名は契約タグ側が定めるため、契約定義には現れない。
 */
export type OutputContract = {
  contract: OutputContractTag;
  properties: Record<string, OutputFieldSpec>;
};

// ─────────────────────────────────────────────
// json_schema
// ─────────────────────────────────────────────

/** json_schema のノード 1 件。 */
export type JsonSchemaNode =
  | { type: 'string' | 'number' | 'integer' | 'boolean' }
  | JsonSchemaEnumNode
  | { type: 'array'; items: JsonSchemaNode }
  | JsonSchemaObjectNode;

/** object 型の json_schema ノード。定義プロパティは全件 required とし、追加プロパティを許さない。 */
export type JsonSchemaObjectNode = {
  type: 'object';
  properties: Record<string, JsonSchemaNode>;
  required: string[];
  additionalProperties: false;
};

/** 語彙制約を持つ文字列ノード。許容値はフォールバック値を含む値域そのものとする（R-003 / §4.3.1）。 */
export type JsonSchemaEnumNode = {
  type: 'string';
  enum: string[];
};
