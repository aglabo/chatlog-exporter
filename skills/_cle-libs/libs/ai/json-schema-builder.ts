// src: skills/_cle-libs/libs/ai/json-schema-builder.ts
// @(#): 出力契約から response_format 用の json_schema を構築する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// types
import type {
  JsonSchemaEnumNode,
  JsonSchemaNode,
  JsonSchemaObjectNode,
  OutputContract,
  OutputEnumFieldSpec,
  OutputFieldSpec,
} from '../../types/json-schema.types.ts';

/** `json-array` 契約で配列を包む envelope フィールド名（structured-output §4.3）。 */
const _ARRAY_ENVELOPE_FIELD = 'items';

/**
 * プロパティ集合から object ノードを構築する。
 *
 * 定義プロパティを全件 `required` に載せ、`additionalProperties` を常に `false` にする（§4.3）。
 *
 * @param properties - object が持つプロパティ
 * @returns object 型の json_schema ノード
 */
const _objectNode = (properties: Record<string, JsonSchemaNode>): JsonSchemaObjectNode => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * 契約定義のプロパティが語彙制約を持つかを判定する。
 *
 * @param spec - 契約定義のプロパティ 1 件
 * @returns 値域を持つ enum プロパティなら true
 */
const _isEnumSpec = (spec: OutputFieldSpec): spec is OutputEnumFieldSpec => 'values' in spec;

/**
 * 語彙制約を持つプロパティを enum ノードへ変換する。
 *
 * 許容値は渡された値域そのものとする。フォールバック値は値域の一部として既に含まれている
 * 前提であり、値域に無い値をスキーマ側で暗黙に補うことはしない（§4.3.1）。
 *
 * @param spec - 値域とフォールバック値を持つ契約定義
 * @returns enum を持つ json_schema ノード
 */
const _enumNode = (spec: OutputEnumFieldSpec): JsonSchemaEnumNode => ({
  type: 'string',
  enum: [...spec.values],
});

/**
 * 契約定義のプロパティ 1 件を json_schema ノードへ変換する。
 *
 * 入れ子 object は内部キーまで再帰的に展開する。`{ type: 'object' }` で止めると
 * サーバが `{}` を返しても契約検証を通過してしまう（§4.3.1「ネストした object の必須キー」）。
 *
 * @param spec - 契約定義のプロパティ 1 件
 * @returns 対応する json_schema ノード
 */
const _toSchemaNode = (spec: OutputFieldSpec): JsonSchemaNode => {
  switch (spec.type) {
    case 'array':
      return { type: 'array', items: _toSchemaNode(spec.items) };
    case 'object':
      return _contractObjectNode(spec.properties);
    default:
      return _isEnumSpec(spec) ? _enumNode(spec) : { type: spec.type };
  }
};

/**
 * 契約定義のプロパティ集合から object ノードを構築する。
 *
 * キー集合を決めるのは契約タグではなく契約定義であり、この関数が唯一の生成経路となる
 * （§4.3.1 / DR-19 決定 1）。
 *
 * @param properties - 契約定義のプロパティ集合
 * @returns object 型の json_schema ノード
 */
const _contractObjectNode = (properties: Record<string, OutputFieldSpec>): JsonSchemaObjectNode =>
  _objectNode(
    Object.fromEntries(Object.entries(properties).map(([key, spec]) => [key, _toSchemaNode(spec)])),
  );

/**
 * 出力契約から json_schema を構築する。
 *
 * root は常に object とし、配列を root へ置かない（structured-output R-001 / §4.3 / DR-19）。
 * 契約タグが決めるのは envelope の有無だけであり、キー集合は契約定義が決める。
 * ゆえに同じ `yaml` タグでも契約定義が異なればスキーマは一致しない（§4.3.1 / DR-19 決定 1）。
 * `json-array` 契約では契約定義のプロパティを要素とみなし、envelope フィールド
 * `items` の配列として包む。
 *
 * @param contract - 契約タグと契約定義の組（§4.3.1）
 * @returns root が object の json_schema
 */
export const buildJsonSchema = (contract: OutputContract): JsonSchemaObjectNode => {
  const _contractNode = _contractObjectNode(contract.properties);
  return contract.contract === 'json-array'
    ? _objectNode({ [_ARRAY_ENVELOPE_FIELD]: { type: 'array', items: _contractNode } })
    : _contractNode;
};
