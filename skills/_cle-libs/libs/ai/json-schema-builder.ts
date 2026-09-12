// src: skills/_cle-libs/libs/ai/json-schema-builder.ts
// @(#): 出力契約から response_format 用の json_schema を構築する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// types
import type { AiBackend } from '../../types/ai.const.types.ts';
import type {
  JsonSchemaEnumNode,
  JsonSchemaNode,
  JsonSchemaObjectNode,
  OutputContract,
  OutputEnumFieldSpec,
  OutputEnumItemFieldSpec,
  OutputFieldSpec,
  OutputItemFieldSpec,
} from '../../types/json-schema.types.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

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
 * 単一値の位置・配列要素の位置のどちらにも現れうる契約定義。
 *
 * 両者の差は enum バリアントがフォールバック値を持つか否かだけで、json_schema への
 * 変換手順は共通のため、変換関数はこの合併を受け取る（§4.3.1）。
 */
type _AnyFieldSpec = OutputFieldSpec | OutputItemFieldSpec;

/** 位置を問わない enum 契約定義。フォールバック値の有無が単一値／配列要素を分ける。 */
type _AnyEnumFieldSpec = OutputEnumFieldSpec | OutputEnumItemFieldSpec;

/**
 * 契約定義のプロパティが語彙制約を持つかを判定する。
 *
 * @param spec - 契約定義のプロパティ 1 件
 * @returns 値域を持つ enum プロパティなら true
 */
const _isEnumSpec = (spec: _AnyFieldSpec): spec is _AnyEnumFieldSpec => 'values' in spec;

/**
 * 語彙制約を持つプロパティを enum ノードへ変換する。
 *
 * 許容値は渡された値域そのものとする。単一値 enum のフォールバック値が値域に無い場合は
 * 設定エラーとして失敗させ、値域に無い値をスキーマ側で暗黙に補うことはしない（§4.3.1）。
 * 値域の外に置くと「該当なし」を選んだ応答が R-008 の enum 検証で不適合になる。
 *
 * 配列要素の enum（`OutputEnumItemFieldSpec`）にはこの検査を行わない。要素側の「該当なし」は
 * 空配列で表すためフォールバック値をそもそも持たず、型の上でも持てない
 * （§4.3.1「配列値の enum」/ R-003）。
 *
 * 単一値 enum の「該当なし」は値域内のフォールバック値で表し、`type` に `'null'` を
 * 併記しない（§4.3「nullable」/ R-003）。`['string', 'null']` のような nullable 表現を許すと
 * 値域外の `null` が enum 検証を通過し、復元側が値域内の値を前提にできなくなる。
 *
 * @param spec - 値域を持つ契約定義。単一値の位置ではフォールバック値も持つ
 * @returns enum を持つ json_schema ノード
 * @throws {ChatlogError} 単一値 enum のフォールバック値が値域に含まれない場合
 */
const _enumNode = (spec: _AnyEnumFieldSpec): JsonSchemaEnumNode => {
  if ('fallback' in spec && !spec.values.includes(spec.fallback)) {
    throw new ChatlogError(
      'InvalidArgs',
      'FallbackNotInValues',
      `フォールバック値 "${spec.fallback}" が値域に存在しません: [${spec.values.join(', ')}]`,
    );
  }
  return { type: 'string', enum: [...spec.values] };
};

/**
 * 契約定義のプロパティ 1 件を json_schema ノードへ変換する。
 *
 * 入れ子 object は内部キーまで再帰的に展開する。`{ type: 'object' }` で止めると
 * サーバが `{}` を返しても契約検証を通過してしまう（§4.3.1「ネストした object の必須キー」）。
 *
 * @param spec - 契約定義のプロパティ 1 件。単一値・配列要素どちらの位置でもよい
 * @returns 対応する json_schema ノード
 */
const _toSchemaNode = (spec: _AnyFieldSpec): JsonSchemaNode => {
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
 * @throws {ChatlogError} 単一値 enum のフォールバック値が値域に含まれない場合（§4.3.1）
 */
export const buildJsonSchema = (contract: OutputContract): JsonSchemaObjectNode => {
  const _contractNode = _contractObjectNode(contract.properties);
  return contract.contract === 'json-array'
    ? _objectNode({ [_ARRAY_ENVELOPE_FIELD]: { type: 'array', items: _contractNode } })
    : _contractNode;
};

/**
 * json_schema を構築すべきバックエンドかを判定する。
 *
 * 構築要否を決めるのはバックエンドだけであり、出力契約は判定に関与しない。
 * R-001 は 3 契約（`json-array` / `yaml` / `line-prefixed`）のいずれも除外しないため、
 * llama では契約によらず構築し、CLI バックエンドでは構築しないことで既存 CLI 経路の
 * 挙動を変えない（R-001 / REQ-C-004）。
 *
 * @param backend - 選択されている AI バックエンド
 * @returns llama なら true、CLI バックエンドなら false
 */
export const shouldBuildJsonSchema = (backend: AiBackend): boolean => backend === 'llama';
