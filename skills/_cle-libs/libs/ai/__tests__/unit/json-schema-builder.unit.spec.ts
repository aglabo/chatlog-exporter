// src: skills/_cle-libs/libs/ai/__tests__/unit/json-schema-builder.unit.spec.ts
// @(#): json_schema 構築関数 ユニットテスト
//       対象: buildJsonSchema
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertArrayIncludes, assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildJsonSchema } from '../../json-schema-builder.ts';

// ─── Helpers
// types
import type { JsonSchemaNode, OutputContract } from '../../../../types/json-schema.types.ts';

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

// constants

/** `types.dic` のキー相当の値域。フォールバック値 `research` を値域の一部として含む。 */
const TYPE_VALUES = ['research', 'implementation', 'design'];

/** `category.dic` のキー相当の値域。フォールバック値 `development` を値域の一部として含む。 */
const CATEGORY_VALUES = ['development', 'documentation', 'operations'];

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

// ─── Tests

/**
 * `buildJsonSchema` のユニットテストスイート。
 *
 * 契約タグと契約定義の組から `response_format` 用の json_schema を構築する責務を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-JSB-01-01 〜 T-LIB-AI-JSB-04-01
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
    it('[Normal] T-LIB-AI-JSB-01-01: root が object であり envelope フィールド `items` が配列型になる', () => {
      const _schema = buildJsonSchema(CLASSIFY_CONTRACT);

      assertEquals(_schema.type, 'object');
      assertEquals(_schema.properties.items.type, 'array');
      assertEquals(_schema.required, ['items']);
      assertEquals(_schema.additionalProperties, false);
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
  });
});
