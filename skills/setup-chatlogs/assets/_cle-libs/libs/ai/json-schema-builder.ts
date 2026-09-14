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
 * 許容値は渡された値域そのものとする。値域規則（空値域・空文字列・フォールバック値の包含）は
 * {@link assertOutputContractValues} が構築前に検査済みであり、ここでは検査しない。
 *
 * 単一値 enum の「該当なし」は値域内のフォールバック値で表し、`type` に `'null'` を
 * 併記しない（§4.3「nullable」/ R-003）。`['string', 'null']` のような nullable 表現を許すと
 * 値域外の `null` が enum 検証を通過し、復元側が値域内の値を前提にできなくなる。
 *
 * @param spec - 値域を持つ契約定義。単一値の位置ではフォールバック値も持つ
 * @returns enum を持つ json_schema ノード
 */
const _enumNode = (spec: _AnyEnumFieldSpec): JsonSchemaEnumNode => ({ type: 'string', enum: [...spec.values] });

/**
 * 値域を持つ enum 1 件が値域規則に違反する理由を求める。
 *
 * 検査順は 空値域 → 空文字列 → フォールバック値 とし、最初に該当した理由だけを返す。
 * 空値域を先に見ないと、フォールバック値を持つ enum では空値域が「フォールバック値が値域に無い」と
 * 報告され、辞書欠落という原因が隠れる。
 *
 * 空値域は単一値 enum のみ拒否する。配列要素 enum の空値域は空辞書として許容し、
 * スキーマ上は空配列（「該当なし」）のみを許す。空文字列は位置を問わず拒否する。
 *
 * @param spec - 値域を持つ契約定義
 * @param isItem - 配列要素の位置なら true
 * @returns 違反理由。規則に適合していれば undefined
 */
const _enumValuesViolation = (spec: _AnyEnumFieldSpec, isItem: boolean): string | undefined => {
  if (!isItem && spec.values.length === 0) {
    return '値域が空です';
  }
  const _values = JSON.stringify(spec.values);
  if (spec.values.includes('')) {
    return `値域に空文字列が含まれます: ${_values}`;
  }
  if ('fallback' in spec && !spec.values.includes(spec.fallback)) {
    return `フォールバック値 "${spec.fallback}" が値域に存在しません: ${_values}`;
  }
  return undefined;
};

/**
 * 値域を持つ enum 1 件の値域規則を検査する。
 *
 * @param spec - 値域を持つ契約定義
 * @param path - 契約定義上の位置
 * @param isItem - 配列要素の位置なら true
 * @throws {ChatlogError} 値域規則に違反する場合
 */
const _assertEnumValues = (spec: _AnyEnumFieldSpec, path: string, isItem: boolean): void => {
  const _reason = _enumValuesViolation(spec, isItem);
  if (_reason !== undefined) {
    throw new ChatlogError('AiError', 'ResponseSchemaViolation', `${path}: ${_reason}`);
  }
};

/**
 * 契約定義のプロパティ 1 件を再帰走査し、値域を持つ enum を検査する。
 *
 * @param spec - 契約定義のプロパティ 1 件。単一値・配列要素どちらの位置でもよい
 * @param path - 契約定義上の位置
 * @param isItem - 配列要素の位置なら true。入れ子 object のプロパティは単一値の位置に戻る
 */
const _assertSpecValues = (spec: _AnyFieldSpec, path: string, isItem = false): void => {
  switch (spec.type) {
    case 'array':
      return _assertSpecValues(spec.items, `${path}[]`, true);
    case 'object':
      return _assertPropertiesValues(spec.properties, path);
    default:
      return _isEnumSpec(spec) ? _assertEnumValues(spec, path, isItem) : undefined;
  }
};

/**
 * 契約定義のプロパティ集合を定義順に走査する。
 *
 * @param properties - 契約定義のプロパティ集合
 * @param parent - 親の位置。トップレベルでは空文字列
 */
const _assertPropertiesValues = (properties: Record<string, OutputFieldSpec>, parent: string): void =>
  Object.entries(properties).forEach(([key, spec]) =>
    _assertSpecValues(spec, parent === '' ? key : `${parent}.${key}`)
  );

/**
 * 出力契約の全 enum の値域を検証する。
 *
 * 契約定義のプロパティを定義順に、入れ子 object の内部キー・配列要素・配列要素 object の
 * プロパティまで再帰走査し、値域を持つ enum ごとに次の順で検査して最初の違反で失敗する。
 *
 * 1. 単一値 enum の値域が空（辞書欠落）
 * 2. 値域に空文字列を含む（空辞書は `''.split(',')` → `['']` となり、1 件の値域に見える）
 * 3. 単一値 enum のフォールバック値が値域に含まれない
 *
 * 辞書に無い値をスキーマ側で暗黙に補ってはならない（§4.3.1「フォールバック値が値域に含まれること」）。
 * フォールバック値を値域の外に置くと「該当なし」を選んだ応答が R-008 の enum 検証で不適合になる。
 * 配列要素の enum（`OutputEnumItemFieldSpec`）はフォールバック値を持たない。要素側の「該当なし」は
 * 空配列で表すため、型の上でも持てない（§4.3.1「配列値の enum」/ R-003）。配列要素 enum の空値域は
 * 空辞書として許容し、スキーマ上は空配列のみを許す（数量制約は置かない / R-002）。空文字列の検査は
 * 位置を問わず適用する。
 *
 * detail は `<path>: <理由>` 形式とする。path はトップレベルでキー名、入れ子 object で `親.子`、
 * 配列要素で `キー[]` を用いる。`json-array` の envelope `items` は契約定義に現れないため含めない。
 *
 * 分類は `kind` を `AiError`、subindex を続行側の `ResponseSchemaViolation` に固定する。
 * DR-18 決定 1 が「llama 経路が throw する `ChatlogError` の kind は一律 `AiError` とし、
 * 呼び出し元の最後の分岐（非 `AiError` → フォールバック値）へ落ちる経路を作らない」と
 * 定めるためである。`InvalidArgs` は `isAbortingAiError`（`abort-utils.ts`）にも
 * `isFatalAiError`（`rate-limit-utils.ts`）にも該当しない — いずれも `kind === 'AiError'` を
 * 要求するため、呼び出し元 catch の最終分岐へ落ち、設定ミスが既定値の一括書き込みとして
 * 現れる（DR-18 が DR-12 を supersede した当の述語ギャップ）。
 *
 * subindex は §3.2 の既存 6 分類から選び、新設しない（DR-26「既存の分類が当てはまるなら
 * subindex を増やさない」）。契約定義自身の不変条件違反を続行側 `ResponseSchemaViolation` に
 * 固定した `output-contract.ts` `_assertFirstField` と同じ扱いに揃える。中断側 4 分類は
 * `abort-utils.ts` の `_ABORT_REASON_LABELS` が単独所有する（DR-16 決定 1）ため増やさない。
 *
 * @param contract - 契約タグと契約定義の組（§4.3.1）
 * @throws {ChatlogError} いずれかの enum が値域規則に違反する場合
 */
export const assertOutputContractValues = (contract: OutputContract): void =>
  _assertPropertiesValues(contract.properties, '');

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
 * 構築前に {@link assertOutputContractValues} で値域規則を検査する。
 *
 * @param contract - 契約タグと契約定義の組（§4.3.1）
 * @returns root が object の json_schema
 * @throws {ChatlogError} 単一値 enum の値域が空・値域が空文字列を含む・単一値 enum のフォールバック値が
 *   値域に含まれない、のいずれかの場合（§4.3.1）
 */
export const buildJsonSchema = (contract: OutputContract): JsonSchemaObjectNode => {
  assertOutputContractValues(contract);
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
