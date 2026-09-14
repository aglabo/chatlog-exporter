// src: skills/_cle-libs/libs/ai/output-contract.ts
// @(#): on-wire contract validation と契約別の復元を行う
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── External modules
// YAML シリアライズ (@std/yaml)
import { stringify as stringifyYaml } from 'jsr:@std/yaml@^1.0.12';

// ─── Shared libraries
// types
import type { OutputContract, OutputFieldSpec, OutputItemFieldSpec } from '../../types/json-schema.types.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

/**
 * `json-array` 契約で配列を包む envelope フィールド名（structured-output §4.3）。
 *
 * スキーマ構築側（`json-schema-builder.ts`）にも同名の内部定数がある。両者は同じ仕様条項に
 * 由来するため、共通化は T-09 全体の Code Refactor で扱う。
 */
const _ARRAY_ENVELOPE_FIELD = 'items';

/**
 * 契約不適合を表す例外を組み立てる。分類は続行側の `ResponseSchemaViolation` に固定する。
 * 中断側の `ResponseFormatIgnored` としてはならない（DR-16）。単一応答の不適合は
 * バックエンドが使えないことを意味せず、一括処理を中断させない。
 */
const _violation = (detail: string): ChatlogError => new ChatlogError('AiError', 'ResponseSchemaViolation', detail);

/** 値が null でない素の object かを判定する。配列は要素の入れ物であり object として扱わない。 */
const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 値が素の object であることを表明し、そのまま返す（§4.1「root が object であり」）。
 *
 * @throws {ChatlogError} 値が object でないとき（文字列・配列・null を含む）
 */
const _assertRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!_isRecord(value)) { throw _violation(`"${path}" is not an object`); }
  return value;
};

/**
 * `json-array` 契約の envelope を降り、要素の配列を返す（R-008 / §4.1 `json-array` 行 / DR-18）。
 *
 * root が object で、envelope フィールド `items` の値が配列であることのみを見る。
 * 要素内のキーや型は検査しない（それらは {@link validateOutputContract} 本体が担う）。
 * 配列を戻り値として返すことで、呼び出し側に検査の実行順を前提とした型キャストを残さない。
 *
 * @throws {ChatlogError} root が object でない、`items` が欠落している、または値が配列でないとき
 */
const _envelopeItems = (payload: unknown): unknown[] => {
  const _items = _isRecord(payload) ? payload[_ARRAY_ENVELOPE_FIELD] : undefined;
  if (!Array.isArray(_items)) { throw _violation(`"${_ARRAY_ENVELOPE_FIELD}" is missing or not an array`); }
  return _items;
};

/**
 * 契約定義の `properties` が記述する単位のペイロードを取り出す。
 *
 * `json-array` の `properties` は envelope に包まれる **要素** のプロパティを表すため、
 * envelope を降りて要素の配列を返す（§4.3.1）。それ以外の契約タグでは root object 自身が対象。
 * envelope の存在と配列性は {@link _envelopeItems} 自身が確かめるため、呼び出し順に依存しない。
 *
 * 対象が object でない応答は違反として投げる。黙って対象 0 件に畳むと、契約不適合な応答が
 * 検証を素通りして既存パース経路へ暗黙にフォールバックする（R-008 / DR-09 が不採用とした挙動）。
 *
 * @throws {ChatlogError} envelope が不適合、または検証対象が object でないとき
 */
const _targetsOf = (contract: OutputContract, payload: unknown): Record<string, unknown>[] => {
  if (contract.contract !== 'json-array') { return [_assertRecord(payload, 'response root')]; }
  return _envelopeItems(payload).map((item, index) => _assertRecord(item, `${_ARRAY_ENVELOPE_FIELD}[${index}]`));
};

/** 契約定義のスカラー型 1 件に値が適合するかを判定する。`integer` は `number` より狭い。 */
const _matchesScalar = (type: string, value: unknown): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
};

/**
 * enum フィールドの値が契約定義の値域に属することを表明する（§4.1「enum を含む場合」）。
 *
 * 非文字列は「値域に含まれない」として違反にする。素通りさせると復元結果が `type: [object Object]`
 * となり、呼び出し元の行頭前方一致は一致するのに値が解決できず、既定値が全件へ書き込まれる
 * （DR-19 Alternatives が禁じた失敗）。条件は**非文字列の拒否**であり、非文字列の除外ではない。
 *
 * R-003 により `fallback` は `values` の一部であることが保証されるため、単一値 enum
 * （{@link OutputEnumFieldSpec}）と配列要素 enum（{@link OutputEnumItemFieldSpec}）の
 * どちらの位置でも `values` への単一の所属判定で足りる。フォールバック値の特別扱いはしない。
 *
 * @throws {ChatlogError} 値が文字列でない、または `values` に含まれないとき
 */
const _assertEnum = (values: string[], value: unknown, path: string): void => {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw _violation(`value "${value}" is not in the allowed values of "${path}"`);
  }
};

/**
 * 契約定義 1 件に対して値を再帰的に検証する（R-008 / §4.1 / §4.3.1）。
 *
 * 単一値の位置（{@link OutputFieldSpec}）と配列要素の位置（{@link OutputItemFieldSpec}）は
 * `type` / `items` / `properties` / `values` の形が同じであり、両者を同じ経路で扱える。
 * R-003 により `fallback` は `values` の一部であるため、enum の所属判定は位置に依らず
 * {@link _assertEnum} 1 つで正しく、単一値 enum と配列要素 enum を取り違える対象がそもそも無い。
 * したがって enum の値域検査は**あらゆる深さ**（直下キー・配列要素・入れ子 object の内部キー）へ
 * 同じ規則で適用される。
 *
 * object は契約定義に現れるプロパティをすべて required とみなし、欠落を違反とする。
 * 契約定義に無いキーは判定に影響させない（フル JSON Schema validation は行わない）。
 *
 * @throws {ChatlogError} 型が不一致、enum が値域外、または object の定義プロパティが欠落しているとき
 */
const _assertSpec = (spec: OutputFieldSpec | OutputItemFieldSpec, value: unknown, path: string): void => {
  if ('values' in spec) { return _assertEnum(spec.values, value, path); }

  switch (spec.type) {
    case 'array':
      if (!Array.isArray(value)) { throw _violation(`"${path}" is not an array`); }
      value.forEach((item, index) => _assertSpec(spec.items, item, `${path}[${index}]`));
      return;
    case 'object':
      if (!_isRecord(value)) { throw _violation(`"${path}" is not an object`); }
      Object.entries(spec.properties).forEach(([key, child]) => {
        const _childPath = `${path}.${key}`;
        if (!(key in value)) { throw _violation(`"${_childPath}" is missing`); }
        _assertSpec(child, value[key], _childPath);
      });
      return;
    default:
      if (!_matchesScalar(spec.type, value)) { throw _violation(`"${path}" is not a ${spec.type}`); }
  }
};

/**
 * `yaml` 契約の起点キーが契約定義のキーに含まれることを表明する（§4.3.1「復元の起点」）。
 *
 * 型は `firstField` の**不在**しか防がず、**誤り**を防がない。破れると {@link _yamlOrdered} の
 * フィルタが何にも一致せず、呼び出し元の `extractYaml(text, <起点キー>)` が起点キーより前に
 * 置かれた required keys を黙って落とす。検証を通過した後に落ちるという点で
 * T-LIB-AI-OCV-12-01 / 20-01 が塞いだものと同じクラスであり、検証側で止める。
 *
 * 分類は続行側の `ResponseSchemaViolation` に固定する。DR-18 決定 1 が「llama 経路が throw する
 * `ChatlogError` の kind は一律 `AiError` とし、呼び出し元の最後の分岐（非 `AiError` →
 * フォールバック値）へ落ちる経路を作らない」と定めるためである。`InvalidArgs` は
 * `isAbortingAiError`（`abort-utils.ts`）にも `isFatalAiError`（`rate-limit-utils.ts`）にも
 * 該当しない — いずれも `kind === 'AiError'` を要求するため、DR-18 が DR-12 を supersede した
 * 当の述語ギャップ（設定ミスがフォールバック値の一括書き込みとして現れる）を再現してしまう。
 *
 * {@link validateOutputContract} と {@link restoreContractText} の双方から呼ぶ。
 *
 * 所属判定に `in` を使わない。`'toString' in contract.properties` は真になり、
 * 誤った起点キーを取りこぼす。
 *
 * @throws {ChatlogError} `yaml` 契約の起点キーが契約定義のキーに含まれないとき
 */
const _assertFirstField = (contract: OutputContract): void => {
  if (contract.contract !== 'yaml') { return; }

  const _keys = Object.keys(contract.properties);
  if (!_keys.includes(contract.firstField)) {
    throw _violation(`"${contract.firstField}" is not a key of the contract properties [${_keys.join(', ')}]`);
  }
};

/**
 * 応答本文を JSON として parse する（structured-output §4.1「共通: 応答本文が JSON として parse できる」）。
 *
 * parse できない本文は契約不適合であり、`SyntaxError` を漏らさず続行側の
 * `ResponseSchemaViolation` として投げる（DR-18 決定 1: llama 経路の kind は一律 `AiError`）。
 *
 * @param text - assistant 応答本文
 * @returns parse 済みの応答ペイロード
 * @throws {ChatlogError} 本文が JSON として parse できないとき
 */
export const parseContractPayload = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw _violation(`response body is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

/**
 * 応答ペイロードが契約に適合するか検証する（on-wire contract validation, R-007 / R-008）。
 *
 * 応答の不適合は `ChatlogError('AiError', 'ResponseSchemaViolation')` を投げる（続行側の分類）。
 * フル JSON Schema validation は行わず、最小の構造検証に留める。
 *
 * 応答を見る前に契約定義自身の不変条件も検査する。`yaml` 契約の起点キーが契約定義のキーに
 * 含まれない場合も違反として投げる（{@link _assertFirstField}）。
 *
 * 現時点で違反とするのは **`json-array` 契約の envelope 不適合**、**契約定義の直下キーの欠落**、
 * および **契約定義に照らした値の不適合**（スカラー型の不一致・enum の値域外・入れ子構造の
 * 内部キーの欠落や型不一致）である。値の判定は {@link _assertSpec} が契約定義を辿って
 * あらゆる深さへ同じ規則で適用する。
 *
 * 契約定義の `properties` に現れるキーはすべて required keys であり（§4.1）、契約タグに依らず
 * 同じ経路で検査する。required keys は契約定義のみを入力とし、辞書定数を参照しない。
 * 逆に契約定義に無いキーは判定に影響させない（§2.4 Non-Goal / DR-26 決定 2）。
 *
 * @param contract - 呼び出し元が指定した出力契約。値域は辞書定数ではなく本引数から読む
 * @param payload - JSON として parse 済みの応答ペイロード
 * @throws {ChatlogError} 契約定義の起点キーが不正・envelope が不適合・required key が欠落・
 * 値が契約定義に適合しないとき
 */
export const validateOutputContract = (contract: OutputContract, payload: unknown): void => {
  _assertFirstField(contract);
  const _specs = Object.entries(contract.properties);

  _targetsOf(contract, payload).forEach((target) => {
    const _missing = _specs.find(([key]) => !(key in target));
    if (_missing !== undefined) { throw _violation(`"${_missing[0]}" is missing`); }

    _specs.forEach(([key, spec]) => _assertSpec(spec, target[key], key));
  });
};

/**
 * 指定したキーがすべて応答に存在することを確かめる。
 *
 * 復元経路の共通ガード。欠落したキーを黙って落とすと、呼び出し元のパーサが値を解決できないまま
 * 既定値を書き込む（DR-19 Alternatives が禁じた失敗）。所属判定は {@link validateOutputContract}
 * と同じく応答側の `in` を用いる。
 *
 * @throws {ChatlogError} いずれかのキーが応答に存在しないとき
 */
const _assertKeysPresent = (keys: string[], root: Record<string, unknown>): void => {
  const _missing = keys.find((key) => !(key in root));
  if (_missing !== undefined) { throw _violation(`"${_missing}" is missing`); }
};

/**
 * 契約定義のキー順に `[キー, 値]` を並べ直す（`line-prefixed` 専用）。
 *
 * 応答のキー順はモデル任せであり仕様は何も保証しない。`line-prefixed` の復元先は
 * §4.3「`line-prefixed` のキー集合」が required keys との完全一致を要求するため、
 * 契約定義のキーだけを契約定義の順で並べる。応答側にしか無いキーはここで落ちる。
 *
 * 逆に契約定義のキーが応答に無いときは違反として投げる。`undefined` を載せたまま並べると
 * `category: undefined` の行が呼び出し元の行頭前方一致に一致し、値が解決できないまま
 * 既定値が書き込まれる（DR-19 Alternatives が禁じた失敗）。{@link restoreContractText} は
 * 検証通過済みの応答を前提とするが、同じ沈黙経路が同じ関数に残る以上ここで塞ぐ。
 *
 * `yaml` はこの規則の対象外である。§4.3 の復元先表は `yaml` を「root object を YAML として
 * シリアライズしたテキスト」と定めるのみで、キーの削除を授権していない（{@link _yamlOrdered}）。
 *
 * @throws {ChatlogError} 契約定義のキーが応答に存在しないとき
 */
const _orderedEntries = (contract: OutputContract, root: Record<string, unknown>): [string, unknown][] => {
  const _keys = Object.keys(contract.properties);
  _assertKeysPresent(_keys, root);
  return _keys.map((key) => [key, root[key]]);
};

/**
 * `yaml` 契約の root object を、起点キーを先頭に置いた object へ並べ直す。
 *
 * 呼び出し元は `extractYaml(_raw, <起点キー>)` で起点キーから読み始めるため（§4.3.1「復元の起点」）、
 * 起点キーより前に置かれたキーは検証通過後に黙って落ちる。起点は §4.3.1 の「復元の起点」列
 * （{@link OutputContract} の `firstField`）が定めるものであり、応答のキー順でも契約定義の記述順でもない。
 *
 * 応答のキーは 1 件も落とさない。契約定義に無いトップレベルキーも、入れ子 object の内部キーも
 * そのまま残す（全深度で同じ規則）。
 *
 * 応答側に起点キーが無いときは違反として投げる。フィルタが空振りした結果を黙って返すと、
 * 呼び出し元の `extractYaml(text, <起点キー>)` が起点を見つけられず required keys を落とす。
 * {@link _orderedEntries} が `line-prefixed` の欠落キーを塞ぐのと同じクラスの沈黙経路である。
 *
 * @throws {ChatlogError} 起点キーが応答に存在しないとき
 */
const _yamlOrdered = (firstField: string, root: Record<string, unknown>): Record<string, unknown> => {
  _assertKeysPresent([firstField], root);
  const _entries = Object.entries(root);
  return Object.fromEntries([
    ..._entries.filter(([key]) => key === firstField),
    ..._entries.filter(([key]) => key !== firstField),
  ]);
};

/**
 * 応答ペイロードを契約ごとの文字列表現へ復元する（structured-output §4.3）。
 *
 * `json-array` は envelope を展開し、`items` の値を JSON 配列としてシリアライズする。
 * `yaml` は root object を起点キー（`firstField`）が先頭になるよう並べ直して YAML テキストへ
 * シリアライズし、応答のキーは全深度で 1 件も落とさない（§4.3 は `yaml` にキーの削除を授権していない）。
 * `line-prefixed` は契約定義のキー順に `<キー>: <値>` を 1 行ずつ並べ、キー集合を required keys と
 * 完全一致させる（§4.3「`line-prefixed` のキー集合」）。
 * 戻り値は呼び出し元の既存パーサ（`parseAiJsonArray` / `extractYaml` / 行頭前方一致）が
 * そのまま解釈できる文字列となる。
 *
 * `yaml` の起点キーが契約定義のキーに無い場合（{@link _assertFirstField}）、および応答に
 * 起点キーが無い場合（{@link _yamlOrdered}）は違反として投げる。
 * 空振りしたフィルタの結果を黙って返すと、呼び出し元の `extractYaml(text, <起点キー>)` が
 * 起点キーを見つけられず required keys を落とす。`line-prefixed` の欠落キーを
 * {@link _orderedEntries} が塞ぐのと同じクラスの沈黙経路であり、同じ関数に残さない。
 *
 * root が object でない応答は契約タグに依らず違反として投げる。添字アクセスが素の `TypeError` に
 * なる経路と、`undefined` を載せた壊れたテキストを黙って返す経路の双方が、続行側の分類（DR-16）を
 * 迂回するためである。
 *
 * @param contract - 呼び出し元が指定した出力契約
 * @param payload - {@link validateOutputContract} を通過した応答ペイロード
 * @returns 契約タグに対応する復元済みテキスト
 * @throws {ChatlogError} ペイロードが object でない、envelope が不適合、`yaml` の起点キーが
 * 契約定義のキーに無い、`yaml` の起点キーが応答に無い、または `line-prefixed` の契約定義のキーが
 * 応答に無いとき
 */
export const restoreContractText = (contract: OutputContract, payload: unknown): string => {
  const _root = _assertRecord(payload, 'response root');

  switch (contract.contract) {
    case 'json-array':
      return JSON.stringify(_envelopeItems(_root));
    case 'yaml':
      _assertFirstField(contract);
      return stringifyYaml(_yamlOrdered(contract.firstField, _root));
    case 'line-prefixed':
      return _orderedEntries(contract, _root)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    default: {
      const _never: never = contract;
      throw _violation(`unsupported output contract: ${JSON.stringify(_never)}`);
    }
  }
};
