// src: skills/_cle-libs/libs/ai/__tests__/unit/json-schema-builder.unit.spec.ts
// @(#): json_schema 構築関数 ユニットテスト
//       対象: buildJsonSchema / shouldBuildJsonSchema
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertArrayIncludes, assertEquals, assertNotEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildJsonSchema, shouldBuildJsonSchema } from '../../json-schema-builder.ts';

// ─── Shared libraries
// types
import type { AiBackend } from '../../../../types/ai.const.types.ts';
import { AI_BACKENDS } from '../../../../types/ai.const.types.ts';
// classes
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Helpers
// types
import type { JsonSchemaNode, JsonSchemaObjectNode, OutputContract } from '../../../../types/json-schema.types.ts';

// ─── Internal Helpers

// functions
/**
 * json_schema ノードから `enum` 配列を取り出す。
 *
 * enum ノードでない場合はテストを失敗させる。
 *
 * @param node - 検査対象の json_schema ノード
 * @returns ノードが持つ `enum` 配列
 */
const _enumOf = (node: JsonSchemaNode): string[] => {
  assert('enum' in node, `enum node expected: ${JSON.stringify(node)}`);
  return node.enum;
};

/**
 * 配列ノードから要素ノードを取り出す。
 *
 * 配列ノードでない場合はテストを失敗させる。
 *
 * @param node - 検査対象の json_schema ノード
 * @returns ノードが持つ要素ノード
 */
const _itemsOf = (node: JsonSchemaNode): JsonSchemaNode => {
  assert('items' in node, `array node expected: ${JSON.stringify(node)}`);
  return node.items;
};

/**
 * object ノードとして取り出す。
 *
 * object ノードでない場合はテストを失敗させる。
 *
 * @param node - 検査対象の json_schema ノード
 * @returns object 型の json_schema ノード
 */
const _objectOf = (node: JsonSchemaNode): JsonSchemaObjectNode => {
  assert('properties' in node, `object node expected: ${JSON.stringify(node)}`);
  return node;
};

/**
 * json_schema ノードを再帰走査し、到達可能なノードをすべて集める。
 *
 * `properties` の値だけでなく配列ノードの `items` へも降りる。`items` を辿らないと
 * `json-array` 契約の envelope 要素へ到達できず、走査が root 止まりに退化する。
 * スカラーノードも結果に含めるため、要素型に付いた制約まで検査できる。
 *
 * @param node - 走査の起点となる json_schema ノード
 * @returns 起点自身を含む、到達可能なすべてのノード
 */
const _collectNodes = (node: JsonSchemaNode): JsonSchemaNode[] => {
  if ('properties' in node) {
    return [node, ...Object.values(node.properties).flatMap(_collectNodes)];
  }
  return 'items' in node ? [node, ..._collectNodes(node.items)] : [node];
};

/**
 * ノードの `type` を、単一値・配列形式のどちらでもトークンの配列として取り出す。
 *
 * `JsonSchemaNode['type']` は文字列リテラル union のため、型の上では配列形式を取り得ない。
 * 型を信じて単一値だけを見ると、json_schema として合法な `type: ['string', 'null']` を
 * 生成する退行を検出できなくなる。実値として `unknown` で受けてから正規化する。
 *
 * @param node - 検査対象の json_schema ノード
 * @returns `type` に現れる型名トークンの配列
 */
const _typeTokensOf = (node: JsonSchemaNode): unknown[] => {
  const _type: unknown = (node as { type: unknown }).type;
  return Array.isArray(_type) ? _type : [_type];
};

/**
 * json_schema ノードを再帰走査し、object ノードをすべて集める。
 *
 * @param node - 走査の起点となる json_schema ノード
 * @returns 起点自身を含む、到達可能なすべての object ノード
 */
const _collectObjectNodes = (node: JsonSchemaNode): JsonSchemaObjectNode[] =>
  _collectNodes(node).filter((each): each is JsonSchemaObjectNode => 'properties' in each);

// constants

/** `types.dic` のキー相当の値域。フォールバック値 `research` を値域の一部として含む。 */
const TYPE_VALUES = ['research', 'implementation', 'design'];

/** `category.dic` のキー相当の値域。フォールバック値 `development` を値域の一部として含む。 */
const CATEGORY_VALUES = ['development', 'documentation', 'operations'];

/** `topics.dic` のキー相当の値域。配列要素の語彙制約であり「なし」を意味する専用値を持たない。 */
const TOPIC_VALUES = ['ai-backend', 'structured-output', 'testing'];

/** `tags.dic` のキー相当の値域。配列要素の語彙制約であり「なし」を意味する専用値を持たない。 */
const TAG_VALUES = ['deno', 'typescript', 'json-schema'];

/**
 * structured-output 仕様 §4.3.1 #1（`phase-classify-ai.ts`）の契約定義。
 *
 * 契約タグは `json-array`。要素キーは `file` / `project` / `confidence` / `reason` の 4 つで、
 * envelope 名 `items` は契約タグ側が定めるため契約定義には現れない。
 */
const CLASSIFY_CONTRACT: OutputContract = {
  contract: 'json-array',
  properties: {
    file: { type: 'string' },
    project: { type: 'string' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
};

/** `projects.dic` のプロジェクト名相当の値域。フォールバック値 `misc` を値域の一部として含む。 */
const PROJECT_VALUES = ['chatlog-exporter', 'deckrd', 'misc'];

/**
 * `FILTER_DECISIONS` 相当の値域。フォールバック値 `ERROR` を値域の一部として含む。
 *
 * `process-chunk.ts` の system prompt はモデルへ `KEEP or DISCARD` を要求し、
 * フォールバック値 `ERROR` が「判定不能」を表す（§4.3.1 #2）。`FILTER_DECISIONS.EMPTY`（`''`）は
 * 閾値未満のグレーゾーンを cache へ書く際の内部センチネルであり、モデルの出力値ではないため含めない。
 */
const DECISION_VALUES = ['KEEP', 'DISCARD', 'ERROR'];

/**
 * structured-output 仕様 §4.3.1 #1（`phase-classify-ai.ts`）の契約定義に、辞書由来 enum を付与したもの。
 *
 * `project` は `json-array` の envelope 要素 object の中にある **単一値** enum であり、
 * 配列要素の enum ではない。したがってフォールバック値 `misc` を値域の一部として持つ（R-003）。
 * 値域とフォールバック値は実行時に `projects.dic` から読むため、契約定義の一部として渡す。
 */
const CLASSIFY_ENUM_CONTRACT: OutputContract = {
  contract: 'json-array',
  properties: {
    file: { type: 'string' },
    project: { type: 'string', values: PROJECT_VALUES, fallback: 'misc' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
};

/**
 * structured-output 仕様 §4.3.1 #2（`filter/process-chunk.ts`）の契約定義。
 *
 * 契約タグは `json-array`。要素は `ClaudeResult`（`filter-chatlogs/scripts/types/filter.types.ts`）の
 * `file`: string / `decision`: 単一値 enum / `confidence`: number / `reason`: string。
 * #1 と同じく envelope 要素 object の中の単一値 enum であり、フォールバック値
 * `FILTER_DECISIONS.ERROR`（`'ERROR'`）を値域の一部として含む。
 */
const PROCESS_CHUNK_CONTRACT: OutputContract = {
  contract: 'json-array',
  properties: {
    file: { type: 'string' },
    decision: { type: 'string', values: DECISION_VALUES, fallback: 'ERROR' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
};

/**
 * structured-output 仕様 §4.3.1 #4（`setfm-frontmatter.ts`）の契約定義。
 *
 * 契約タグは `yaml`。required keys は `title`（string）/ `topics`・`tags`（string の配列）。
 * `extractYaml` の第 2 引数（起点キー `title`）は必須キーの一覧ではないため根拠にしない。
 */
const SETFM_FRONTMATTER_CONTRACT: OutputContract = {
  contract: 'yaml',
  properties: {
    title: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * structured-output 仕様 §4.3.1 #5（`setfm-review.ts`）の契約定義。
 *
 * 契約タグは #4 と同じ `yaml` だが required keys は一致しない。
 * `validity`（string）/ `errors`（string の配列）/ `corrected_frontmatter`（入れ子 object）。
 */
const SETFM_REVIEW_CONTRACT: OutputContract = {
  contract: 'yaml',
  properties: {
    validity: { type: 'string' },
    errors: { type: 'array', items: { type: 'string' } },
    corrected_frontmatter: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        category: { type: 'string' },
        title: { type: 'string' },
        topics: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

/**
 * structured-output 仕様 §4.3.1 #6（`setfm-type-category.ts`）の契約定義。
 *
 * 契約タグは `line-prefixed`。required keys は `type` / `category` の 2 つで、いずれも string。
 * 呼び出し元は行頭 `type:` / `category:` を前方一致で探すため、キー集合はこの 2 件と完全一致する。
 */
const SETFM_TYPE_CATEGORY_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: {
    type: { type: 'string' },
    category: { type: 'string' },
  },
};

/**
 * structured-output 仕様 §4.3.1 #6 の契約定義に、辞書由来の enum を付与したもの。
 *
 * `type` の値域は `types.dic` のキー相当、`category` の値域は `category.dic` のキー相当。
 * 値域とフォールバック値は実行時に辞書から読むため、モジュールスコープの定数ではなく
 * 契約定義の一部として渡す（§4.3.1「辞書由来 enum の扱い」）。
 * フォールバック値 `research` / `development` は値域の一部として値域に含まれている。
 */
const SETFM_TYPE_CATEGORY_ENUM_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: {
    type: { type: 'string', values: TYPE_VALUES, fallback: 'research' },
    category: { type: 'string', values: CATEGORY_VALUES, fallback: 'development' },
  },
};

/**
 * structured-output 仕様 §4.3.1 #4（`setfm-frontmatter.ts`）の契約定義に、辞書由来 enum を付与したもの。
 *
 * `topics` / `tags` は配列であり、語彙制約を持つのは **要素** の側になる。
 * 「該当なし」は空配列で表現するため、要素の値域に「なし」を意味する専用値は存在せず、
 * 要素の契約定義はフォールバック値を持たない（§4.3.1「配列値の enum」/ R-003）。
 */
const SETFM_FRONTMATTER_ENUM_CONTRACT: OutputContract = {
  contract: 'yaml',
  properties: {
    title: { type: 'string' },
    topics: { type: 'array', items: { type: 'string', values: TOPIC_VALUES } },
    tags: { type: 'array', items: { type: 'string', values: TAG_VALUES } },
  },
};

/**
 * structured-output 仕様 §4.3.1 #3（`segment-ai.ts`）の契約定義。
 *
 * 契約タグは `json-array`。要素は `filePath`（string）と `segments`（object の配列）で、
 * `segments` の要素は `title` / `summary`（string）と `startLine` / `endLine`（integer）の 4 キーを持つ。
 * `Segment` 型で `startLine` / `endLine` が optional なのは受信後の TypeScript 側の表現であり、
 * スキーマ側の要求ではない。
 */
const SEGMENT_AI_CONTRACT: OutputContract = {
  contract: 'json-array',
  properties: {
    filePath: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
        },
      },
    },
  },
};

/** 実辞書のどのキーとも重ならない合成値域。辞書の実内容への依存を検出するために使う。 */
const SYNTHETIC_TYPE_VALUES = ['alpha', 'beta'];

/**
 * 合成値域を与えた `line-prefixed` 契約の契約定義。
 *
 * 値域もフォールバック値も実辞書に存在しない値で構成する。構築関数がモジュールスコープの
 * 定数（`DEFAULT_FALLBACK_TYPE` 等）を参照していれば、生成 enum に実辞書由来の値が混ざる
 * （§4.3.1「辞書由来 enum の扱い」）。
 */
const SYNTHETIC_ENUM_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: {
    type: { type: 'string', values: SYNTHETIC_TYPE_VALUES, fallback: 'alpha' },
  },
};

/**
 * 値域に存在しないフォールバック値を持つ `line-prefixed` 契約の契約定義。
 *
 * 辞書の改訂でフォールバック値がキー集合から消えた状況を表す（§4.3.1）。
 */
const INVALID_FALLBACK_CONTRACT: OutputContract = {
  contract: 'line-prefixed',
  properties: {
    type: { type: 'string', values: SYNTHETIC_TYPE_VALUES, fallback: 'gamma' },
  },
};

/** T-08-06 で走査する契約ケース。expected は到達可能な object ノードの総数。 */
const _ADDITIONAL_PROPERTIES_CASES: { label: string; contract: OutputContract; objectNodeCount: number }[] = [
  // root（envelope）と要素 object の 2 件。`items` を辿らなければ要素側に到達できない
  { label: 'json-array #1', contract: CLASSIFY_CONTRACT, objectNodeCount: 2 },
  { label: 'yaml #4', contract: SETFM_FRONTMATTER_CONTRACT, objectNodeCount: 1 },
  { label: 'yaml #5（入れ子 object）', contract: SETFM_REVIEW_CONTRACT, objectNodeCount: 2 },
  { label: 'line-prefixed #6', contract: SETFM_TYPE_CATEGORY_CONTRACT, objectNodeCount: 1 },
];

/** T-08-06-01 のテスト ID。テーブル駆動でラベルへ展開する。 */
const _ADDITIONAL_PROPERTIES_TEST_ID = 'T-LIB-AI-JSB-06-01';

/**
 * スキーマに現れてはならない数量制約キー（R-002 / DD-01 / DR-04）。
 *
 * 件数・長さを縛るとモデルが契約を満たすために内容を水増し／切り詰める。
 * 「該当なし」は空配列・空文字で表現するため、どの深さにも置かない。
 *
 * この一覧がそのまま `T-LIB-AI-JSB-08-01` の退行検出範囲になる。
 * ここに無いキーは実装が付与しても検出されないため、JSON Schema の
 * 数量・範囲制約キーを網羅して並べる。スキーマ生成に新たな数量制約キーを
 * 足す変更が入ったら、まずこの一覧へ追加すること。
 */
const _QUANTITY_CONSTRAINT_KEYS = [
  // 配列の件数
  'minItems',
  'maxItems',
  'minContains',
  'maxContains',
  // object のプロパティ数
  'minProperties',
  'maxProperties',
  // 文字列長
  'minLength',
  'maxLength',
  // 数値の範囲・刻み
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
];

/**
 * `SEGMENT_AI_CONTRACT`（§4.3.1 #3）の生成スキーマで到達可能なノードの総数。
 *
 * root envelope object / `items` 配列 / 要素 object / `filePath` / `segments` 配列 /
 * segment object / その 4 スカラー の 10 件。走査が `properties` と `items` の
 * 双方へ降りていなければこの件数に届かない。
 */
const _SEGMENT_AI_NODE_COUNT = 10;

/** T-08-08-01 のテスト ID。 */
const _QUANTITY_TEST_ID = 'T-LIB-AI-JSB-08-01';

/**
 * `SETFM_TYPE_CATEGORY_ENUM_CONTRACT` の生成スキーマで到達可能なノードの総数。
 *
 * root object と `type` / `category` の enum ノードの 3 件。
 */
const _TYPE_CATEGORY_ENUM_NODE_COUNT = 3;

/**
 * T-08-09 で走査する契約ケース。expected は到達可能なノードの総数。
 *
 * 「該当なし」を許容する単一値 enum（§4.3.1 の `type` / `category`）と、入れ子の配列・object を
 * 持つ契約（§4.3.1 #3）の双方を掃く。前者だけでは深さ 1 までしか見ておらず
 * 「どの深さにも `'null'` が無い」ことを固定できない。
 */
const _NULLABLE_CASES: { label: string; contract: OutputContract; nodeCount: number }[] = [
  {
    label: '単一値 enum（type / category）',
    contract: SETFM_TYPE_CATEGORY_ENUM_CONTRACT,
    nodeCount: _TYPE_CATEGORY_ENUM_NODE_COUNT,
  },
  { label: 'ネストした配列・object', contract: SEGMENT_AI_CONTRACT, nodeCount: _SEGMENT_AI_NODE_COUNT },
];

/** T-08-09-01 のテスト ID。 */
const _NULLABLE_TEST_ID = 'T-LIB-AI-JSB-09-01';

/**
 * バックエンドごとの構築要否の期待値（R-001 / REQ-C-004）。
 *
 * 期待値は関数の判定式から導かず literal で置く。`backend === 'llama'` で導くと
 * 実装を写したテストになり、判定が壊れても失敗しない。
 */
const _SHOULD_BUILD_CASES: { backend: AiBackend; expected: boolean }[] = [
  { backend: 'claude', expected: false },
  { backend: 'codex', expected: false },
  { backend: 'copilot', expected: false },
  { backend: 'opencode', expected: false },
  { backend: 'antigravity', expected: false },
  { backend: 'llama', expected: true },
];

/** T-08-07-01 のテスト ID。テーブル駆動でラベルへ展開する。 */
const _SHOULD_BUILD_TEST_ID = 'T-LIB-AI-JSB-07-01';

// ─── Tests

/**
 * `buildJsonSchema` のユニットテストスイート。
 *
 * 契約タグと契約定義の組から `response_format` 用の json_schema を構築する責務を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-JSB-01-01 〜 T-LIB-AI-JSB-06-01
 *
 * @see buildJsonSchema
 */
describe('buildJsonSchema', () => {
  /**
   * `json-array` 契約のスキーマ構築テスト。
   *
   * root が object であり、配列が envelope フィールド `items` として表現されることを検証する。
   */
  describe('json-array 契約', () => {
    it('[Normal] T-LIB-AI-JSB-01-01: #1 の envelope が配列型になり、要素キー集合と要素側 `required` が契約定義と一致する', () => {
      const _schema = buildJsonSchema(CLASSIFY_CONTRACT);

      assertEquals(_schema.type, 'object');
      assertEquals(_schema.properties.items.type, 'array');
      assertEquals(_schema.required, ['items']);
      assertEquals(_schema.additionalProperties, false);

      // envelope だけを見ると要素が `{}` 相当に退化しても素通りする（§4.3.1「ネストした object の必須キー」）
      const _element = _objectOf(_itemsOf(_schema.properties.items));
      const _elementKeys = ['confidence', 'file', 'project', 'reason'];
      assertEquals(Object.keys(_element.properties).sort(), _elementKeys);
      assertEquals(_element.properties.file, { type: 'string' });
      assertEquals(_element.properties.project, { type: 'string' });
      assertEquals(_element.properties.confidence, { type: 'number' });
      assertEquals(_element.properties.reason, { type: 'string' });

      // required は要素側に載る。envelope の `required: ['items']` では代替できない
      assertEquals(new Set(_element.required), new Set(_elementKeys));
      assertEquals(_element.required.length, _elementKeys.length);
    });

    it('[Normal] T-LIB-AI-JSB-01-02: #2 の要素キー集合が `ClaudeResult` と一致し、`decision` の enum がフォールバック値 `ERROR` を含む', () => {
      const _schema = buildJsonSchema(PROCESS_CHUNK_CONTRACT);

      assertEquals(_schema.required, ['items']);

      const _element = _objectOf(_itemsOf(_schema.properties.items));
      const _elementKeys = ['confidence', 'decision', 'file', 'reason'];
      assertEquals(Object.keys(_element.properties).sort(), _elementKeys);
      assertEquals(_element.properties.file, { type: 'string' });
      assertEquals(_element.properties.confidence, { type: 'number' });
      assertEquals(_element.properties.reason, { type: 'string' });

      // 要素 object のプロパティは「単一値の位置」であり、値域は渡した値集合と完全一致する
      assertEquals(_element.properties.decision, { type: 'string', enum: DECISION_VALUES });
      // 「判定不能」を表すフォールバック値が値域の一部として載る（R-003）
      assertArrayIncludes(_enumOf(_element.properties.decision), ['ERROR']);

      assertEquals(new Set(_element.required), new Set(_elementKeys));
      assertEquals(_element.required.length, _elementKeys.length);
    });

    it('[Normal] T-LIB-AI-JSB-01-03: #1 の `project` の enum が渡した値域と一致し、フォールバック値 `misc` を含む', () => {
      const _schema = buildJsonSchema(CLASSIFY_ENUM_CONTRACT);

      const _element = _objectOf(_itemsOf(_schema.properties.items));

      // 完全一致が、実辞書由来の値が混ざらないことを不在まで含めて固定する
      assertEquals(_element.properties.project, { type: 'string', enum: PROJECT_VALUES });
      assertArrayIncludes(_enumOf(_element.properties.project), ['misc']);
      // enum を付けても他の要素キーと要素側 required は変わらない
      const _elementKeys = ['confidence', 'file', 'project', 'reason'];
      assertEquals(new Set(_element.required), new Set(_elementKeys));
      assertEquals(_element.required.length, _elementKeys.length);
    });
  });

  /**
   * `yaml` 契約のスキーマ構築テスト。
   *
   * キー集合が契約定義と完全一致し、各プロパティの型が契約定義どおりになることを検証する。
   */
  describe('yaml 契約', () => {
    it('[Normal] T-LIB-AI-JSB-02-01: プロパティキー集合と各値の型が §4.3.1 の契約定義と一致する', () => {
      const _schema = buildJsonSchema(SETFM_FRONTMATTER_CONTRACT);

      assertEquals(Object.keys(_schema.properties).sort(), ['tags', 'title', 'topics']);
      assertEquals(_schema.properties.title, { type: 'string' });
      assertEquals(_schema.properties.topics, { type: 'array', items: { type: 'string' } });
      assertEquals(_schema.properties.tags, { type: 'array', items: { type: 'string' } });
    });

    it('[Normal] T-LIB-AI-JSB-02-02: 同じ `yaml` タグでも契約定義が異なればキー集合と入れ子 object が変わる', () => {
      const _schema = buildJsonSchema(SETFM_REVIEW_CONTRACT);

      assertEquals(Object.keys(_schema.properties).sort(), ['corrected_frontmatter', 'errors', 'validity']);
      assertEquals(_schema.properties.validity, { type: 'string' });
      assertEquals(_schema.properties.errors, { type: 'array', items: { type: 'string' } });
      assertEquals(_schema.properties.corrected_frontmatter, {
        type: 'object',
        properties: {
          type: { type: 'string' },
          category: { type: 'string' },
          title: { type: 'string' },
          topics: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'category', 'title', 'topics', 'tags'],
        additionalProperties: false,
      });
      assertNotEquals(_schema, buildJsonSchema(SETFM_FRONTMATTER_CONTRACT));
    });
  });

  /**
   * `line-prefixed` 契約のスキーマ構築テスト。
   *
   * キー集合が、呼び出し元が行頭前方一致で探すキーと過不足なく一致することを検証する。
   */
  describe('line-prefixed 契約', () => {
    it('[Normal] T-LIB-AI-JSB-03-01: プロパティキー集合が行頭前方一致キー `type` / `category` と完全一致する', () => {
      const _schema = buildJsonSchema(SETFM_TYPE_CATEGORY_CONTRACT);

      assertEquals(Object.keys(_schema.properties).sort(), ['category', 'type']);
      assertEquals(_schema.properties.type, { type: 'string' });
      assertEquals(_schema.properties.category, { type: 'string' });
    });
  });
  /**
   * 辞書由来 enum のスキーマ構築テスト。
   *
   * 単一値 enum のフォールバック値が、値域の外ではなく `enum` の要素として載ることを検証する。
   * 値域の外に置くと「該当なし」を選んだ応答が R-008 の enum 検証で不適合になる。
   */
  describe('辞書由来 enum', () => {
    it('[Normal] T-LIB-AI-JSB-04-01: 単一値 enum の `enum` が渡した値域と一致し、フォールバック値を値域の一部として含む', () => {
      const _schema = buildJsonSchema(SETFM_TYPE_CATEGORY_ENUM_CONTRACT);

      assertEquals(_schema.properties.type, { type: 'string', enum: TYPE_VALUES });
      assertEquals(_schema.properties.category, { type: 'string', enum: CATEGORY_VALUES });
      assertArrayIncludes(_enumOf(_schema.properties.type), ['research']);
      assertArrayIncludes(_enumOf(_schema.properties.category), ['development']);
    });

    it('[Normal] T-LIB-AI-JSB-04-02: 配列要素の `enum` が渡した値域と完全一致し、`minItems` が置かれない', () => {
      const _schema = buildJsonSchema(SETFM_FRONTMATTER_ENUM_CONTRACT);

      // 「なし」を意味する専用値を足さない。完全一致がその不在を含めて固定する
      assertEquals(_enumOf(_itemsOf(_schema.properties.topics)), TOPIC_VALUES);
      assertEquals(_enumOf(_itemsOf(_schema.properties.tags)), TAG_VALUES);
      // 「該当なし」は空配列で表現するため、数量制約を置かない（R-002）
      assertEquals('minItems' in _schema.properties.topics, false);
      assertEquals('minItems' in _schema.properties.tags, false);
    });

    it('[Normal] T-LIB-AI-JSB-04-03: 実辞書に無い合成値域を渡すと `enum` が渡した値集合と完全一致する', () => {
      const _schema = buildJsonSchema(SYNTHETIC_ENUM_CONTRACT);

      // 完全一致が「モジュール定数由来の値が混ざらない」ことを不在まで含めて固定する
      assertEquals(_schema.properties.type, { type: 'string', enum: SYNTHETIC_TYPE_VALUES });
    });

    it('[Error] T-LIB-AI-JSB-04-04: 値域に存在しないフォールバック値は設定エラーとして失敗する', () => {
      // 単一値 enum。`gamma` を `enum` へ暗黙に補わず、設定エラーとして失敗させる
      const _error = assertThrows(
        () => buildJsonSchema(INVALID_FALLBACK_CONTRACT),
        ChatlogError,
        'gamma',
      );
      assertEquals(_error.kind, 'InvalidArgs');
      assertEquals(_error.subindex, 'FallbackNotInValues');
    });
  });

  /**
   * `required` の網羅性テスト。
   *
   * 契約定義が定めたプロパティは全件が必須であり、省略可能なプロパティを作らないことを検証する
   * （§4.3）。省略を許すとサーバがキーを落とした応答が R-008 の契約検証を通過してしまう。
   */
  describe('required の網羅性', () => {
    it('[Normal] T-LIB-AI-JSB-05-01: `required` が定義済みプロパティ全件と同集合になり、省略可能なプロパティが存在しない', () => {
      const _schema = buildJsonSchema(SETFM_FRONTMATTER_CONTRACT);

      // 契約定義（§4.3.1 #4）の必須キーを直書きし、properties と required の双方を突き合わせる。
      // 生成結果の properties をオラクルにすると、properties と required から同じキーが
      // 同時に落ちても両者は一致したままで GREEN を保ってしまう
      const _expectedKeys = ['title', 'topics', 'tags'];
      const _keys = Object.keys(_schema.properties);

      assertEquals(new Set(_keys), new Set(_expectedKeys));
      assertEquals(new Set(_schema.required), new Set(_expectedKeys));
      // 件数一致が、重複で欠落を覆い隠す `required` と省略可能プロパティの双方を排除する
      assertEquals(_keys.length, _expectedKeys.length);
      assertEquals(_schema.required.length, _expectedKeys.length);
    });

    it('[Normal] T-LIB-AI-JSB-05-02: 入れ子 object の要素スキーマが内部キーまで定義され、4 キーすべてが要素側 `required` に載る', () => {
      const _schema = buildJsonSchema(SEGMENT_AI_CONTRACT);

      const _element = _objectOf(_itemsOf(_schema.properties.items));
      const _segment = _objectOf(_itemsOf(_element.properties.segments));

      // 完全一致が `{ type: 'object' }` 止まりを、余分なキーの不在まで含めて排除する
      assertEquals(_segment, {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
        },
        required: ['title', 'summary', 'startLine', 'endLine'],
        additionalProperties: false,
      });

      // required は要素側に載る。外側の要素（`filePath` / `segments`）の required では代替できない
      const _segmentKeys = ['title', 'summary', 'startLine', 'endLine'];
      assertEquals(new Set(_segment.required), new Set(_segmentKeys));
      assertEquals(_segment.required.length, _segmentKeys.length);
    });
  });
  /**
   * `additionalProperties` の固定テスト。
   *
   * root だけでなく入れ子の object スキーマまで再帰走査し、すべてで `false` が
   * 付与されることを検証する（§4.3）。追加プロパティを許すと契約外のキーを含む応答が
   * R-008 の契約検証を通過してしまう。
   */
  describe('additionalProperties の固定', () => {
    for (const { label, contract, objectNodeCount } of _ADDITIONAL_PROPERTIES_CASES) {
      it(`[Normal] ${_ADDITIONAL_PROPERTIES_TEST_ID}: ${label} の全 object スキーマ（root および入れ子）で additionalProperties が false になる`, () => {
        const _nodes = _collectObjectNodes(buildJsonSchema(contract));

        // 件数一致が、入れ子へ降りない走査（root 止まり）を検出する
        assertEquals(_nodes.length, objectNodeCount);
        assertEquals(_nodes.map((node) => node.additionalProperties), _nodes.map(() => false));
      });
    }
  });

  /**
   * 数量制約の不在テスト。
   *
   * ネストされた配列・オブジェクトを含む契約定義（§4.3.1 #3）の生成スキーマを再帰走査し、
   * どの深さにも数量制約キーが現れないことを検証する（R-002 / DD-01 / DR-04）。
   */
  describe('数量制約の不在', () => {
    it(`[Edge] ${_QUANTITY_TEST_ID}: ネストされた配列・オブジェクトのどの深さにも数量制約キーが存在しない`, () => {
      const _nodes = _collectNodes(buildJsonSchema(SEGMENT_AI_CONTRACT));

      // 件数一致が、入れ子へ降りない走査（root 止まり・配列止まり）を検出する
      assertEquals(_nodes.length, _SEGMENT_AI_NODE_COUNT);

      // 違反キーを収集して突き合わせる。件数比較と違い、失敗時にどのキーが載ったかが出る
      const _offenders = _nodes.flatMap((node) =>
        Object.keys(node).filter((key) => _QUANTITY_CONSTRAINT_KEYS.includes(key))
      );
      assertEquals(_offenders, []);
    });
  });

  /**
   * nullable 表現のテスト。
   *
   * 「該当なし」を `type: 'null'` の併記で表現しないことを検証する（§4.3 / §4.3.1 / R-003）。
   * null を許すと値域外の応答が enum 検証を通過し、復元側が値域内の値を前提にできなくなる。
   * 「該当なし」は値域内のフォールバック値で表す。
   */
  describe('nullable の表現', () => {
    for (const { label, contract, nodeCount } of _NULLABLE_CASES) {
      it(`[Edge] ${_NULLABLE_TEST_ID}: ${label} のどの深さにも type に 'null' が現れない`, () => {
        const _nodes = _collectNodes(buildJsonSchema(contract));

        // 件数一致が、走査が空・root 止まりで素通りする空虚な成功を排除する
        assertEquals(_nodes.length, nodeCount);

        // 違反ノードを収集して突き合わせる。失敗時にどの type が載ったかが出る
        const _offenders = _nodes
          .map(_typeTokensOf)
          .filter((tokens) => tokens.includes('null'));
        assertEquals(_offenders, []);
      });
    }

    it(`[Edge] ${_NULLABLE_TEST_ID}: 単一値 enum の「該当なし」が値域内のフォールバック値で表現される`, () => {
      const _schema = buildJsonSchema(SETFM_TYPE_CATEGORY_ENUM_CONTRACT);

      // null の代替として値域内の値が残っていること。これが無いと「該当なし」を表せない。
      // T-LIB-AI-JSB-04-01 と式は重なるが、あちらが固定するのは「enum が渡した値域と一致する」こと、
      // ここで固定するのは「null の代替が値域内にある」こと（R-003）であり、根拠が異なる
      assertArrayIncludes(_enumOf(_schema.properties.type), ['research']);
      assertArrayIncludes(_enumOf(_schema.properties.category), ['development']);
    });
  });
});

/**
 * `shouldBuildJsonSchema` のユニットテストスイート。
 *
 * スキーマ構築を行うか否かの判定がバックエンドだけで決まることを検証する
 * （structured-output R-001 / REQ-C-004）。llama 以外の CLI バックエンドでは構築せず、
 * 既存 CLI 経路の挙動を変えない。
 *
 * テスト ID 範囲: T-LIB-AI-JSB-07-01
 *
 * @see shouldBuildJsonSchema
 */
describe('shouldBuildJsonSchema', () => {
  /**
   * バックエンド別の構築要否テスト。
   *
   * 契約タグは判定に関与しないため、入力はバックエンドのみとする（R-001 は 3 契約を除外しない）。
   */
  describe('バックエンド別の構築要否', () => {
    it(`[Normal] ${_SHOULD_BUILD_TEST_ID}: 判定ケースが AI_BACKENDS 全件を過不足なく網羅する`, () => {
      // 網羅性の担保。バックエンドが増えたとき期待値の追加漏れをここで落とす
      assertEquals(_SHOULD_BUILD_CASES.length, AI_BACKENDS.length);
      assertEquals(new Set(_SHOULD_BUILD_CASES.map((testCase) => testCase.backend)), new Set(AI_BACKENDS));
    });

    for (const { backend, expected } of _SHOULD_BUILD_CASES) {
      it(`[Normal] ${_SHOULD_BUILD_TEST_ID}: backend=${backend} の構築要否が ${expected} になる`, () => {
        assertEquals(shouldBuildJsonSchema(backend), expected);
      });
    }
  });
});
