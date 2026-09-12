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
 * 語彙制約を持つ**単一値**文字列プロパティの契約定義（structured-output §4.3.1）。
 *
 * 値域 `values` とフォールバック値 `fallback` は `.config/chatlog-exporter/dics/` 配下の辞書から
 * 実行時に読み込まれるため、スキーマ構築側の定数ではなく契約定義として渡す
 * （§4.3.1「辞書由来 enum の扱い」）。`fallback` は `values` の一部でなければならない。
 * 値域の外に置くと「該当なし」を選んだ応答が enum 検証で不適合になる（R-003）。
 *
 * R-003 のフォールバック必須化は `type` / `category` / `project` / `decision` のような
 * 単一値 enum に対する要求であり、配列要素の enum には及ばない（§4.3.1「配列値の enum」）。
 * 配列要素には {@link OutputEnumItemFieldSpec} を使う。
 */
export type OutputEnumFieldSpec = {
  type: 'string';
  values: string[];
  fallback: string;
};

/**
 * 語彙制約を持つ**配列要素**の契約定義（structured-output §4.3.1「配列値の enum」）。
 *
 * `topics` / `tags` のように配列の要素が語彙制約を持つフィールドでは、「該当なし」は
 * **空配列**で表現する。R-002 により `minItems` を置かないため、空配列はスキーマ上つねに
 * 許容される。したがって要素側はフォールバック値を必要とせず、**型として持てない**。
 *
 * フォールバック値を要求すると、自然な「該当なし」を持たない呼び出し元は `values` に
 * 合成キーを足す方向へ圧力を受ける。それは辞書が本来持たない語を分類語彙へ持ち込むことであり、
 * §4.3.1 が明示的に禁じている。
 */
export type OutputEnumItemFieldSpec = {
  type: 'string';
  values: string[];
};

/**
 * 契約定義のプロパティ 1 件の型。単一値が置かれる位置を表す。
 *
 * スカラーのほか、`topics` / `tags` のような要素型を持つ配列と、`corrected_frontmatter` の
 * ような入れ子 object を表現できる（§4.3.1）。入れ子 object も内部キーまで定義する。
 * 配列の要素は単一値の位置ではないため {@link OutputItemFieldSpec} で表す。
 *
 * `required` / `additionalProperties` は契約定義ではなくスキーマ構築側の責務のため、
 * object バリアントには現れない（§4.3）。
 */
export type OutputFieldSpec =
  | { type: 'string' | 'number' | 'integer' | 'boolean' }
  | OutputEnumFieldSpec
  | { type: 'array'; items: OutputItemFieldSpec }
  | { type: 'object'; properties: Record<string, OutputFieldSpec> };

/**
 * 配列要素の契約定義 1 件の型（§4.3.1「配列値の enum」）。
 *
 * 単一値の位置との違いは enum バリアントだけで、要素はフォールバック値を持てない。
 * 一方、要素が object の場合その**プロパティは再び単一値の位置**になるため、
 * `properties` は {@link OutputFieldSpec} のままとする。§4.3.1 #1 の `project` は
 * `json-array` の envelope 要素 object の中にある単一値 enum であり、この経路で表現される。
 */
export type OutputItemFieldSpec =
  | { type: 'string' | 'number' | 'integer' | 'boolean' }
  | OutputEnumItemFieldSpec
  | { type: 'array'; items: OutputItemFieldSpec }
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

/**
 * 語彙制約を持つ文字列ノード。許容値は渡された値域そのものとする（§4.3.1）。
 *
 * 単一値 enum ではフォールバック値も値域の一部として含まれる（R-003）。配列要素の enum は
 * フォールバック値を持たず、「該当なし」は空配列で表す（§4.3.1「配列値の enum」）。
 */
export type JsonSchemaEnumNode = {
  type: 'string';
  enum: string[];
};
