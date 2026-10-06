// src: scripts/libs/__tests__/unit/extract-placeholders.unit.spec.ts
// @(#): extractPlaceholders のユニットテスト
//       対象: extractPlaceholders
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractPlaceholders } from '../../template-utils.ts';

// ─── Internal Helpers

// types
/** extractPlaceholders のテーブル駆動ケース。 */
interface _ExtractCase {
  /** テスト ID。 */
  id: string;
  /** ケースの説明。 */
  desc: string;
  /** 入力テンプレート。 */
  template: string;
  /** 期待するプレースホルダ名の配列。 */
  expected: string[];
}

// constants
/** 正常系: プレースホルダ名が出現順・重複なしで抽出されるケース。 */
const _normalCases: _ExtractCase[] = [
  {
    id: 'T-SF-EP-01-01',
    desc: '複数の異なるプレースホルダ → 出現順の名前配列',
    template: 'Topics: ${topic_list}\nTypes: ${type_list}\nTags: ${tag_list}',
    expected: ['topic_list', 'type_list', 'tag_list'],
  },
  {
    id: 'T-SF-EP-01-02',
    desc: '重複するプレースホルダ → 初出位置で 1 回だけ現れる',
    template: '${a} ${b} ${a} ${c} ${b}',
    expected: ['a', 'b', 'c'],
  },
];

/** エッジケース: 抽出対象が無い、または `${...}` 形式でないケース。 */
const _edgeCases: _ExtractCase[] = [
  {
    id: 'T-SF-EP-02-01',
    desc: 'プレースホルダを含まないテンプレート → 空配列',
    template: 'Plain text only',
    expected: [],
  },
  {
    id: 'T-SF-EP-02-02',
    desc: '空文字列 → 空配列',
    template: '',
    expected: [],
  },
  {
    id: 'T-SF-EP-02-03',
    desc: '波括弧なしの $topic_list → 抽出されない',
    template: 'list: $topic_list',
    expected: [],
  },
  {
    id: 'T-SF-EP-02-04',
    desc: '$ なしの {topic_list} → 抽出されない',
    template: 'list: {topic_list}',
    expected: [],
  },
  {
    id: 'T-SF-EP-02-05',
    desc: '名前検証は行わない: 大文字を含む ${BadName} もそのまま抽出される',
    template: '${BadName} and ${ok}',
    expected: ['BadName', 'ok'],
  },
];

// ─── Tests

/**
 * `extractPlaceholders` のユニットテストスイート。
 *
 * テンプレート内の `${name}` から名前を出現順・重複なしで抽出することを検証する。
 *
 * テスト ID 範囲: T-SF-EP-01-01 〜 T-SF-EP-02-05
 *
 * @see extractPlaceholders
 */
describe('extractPlaceholders', () => {
  /**
   * プレースホルダ名の抽出。
   *
   * 出現順の保持・重複除去・`${...}` 以外の形式を無視することを検証する。
   */
  describe('placeholder extraction', () => {
    /** `${name}` を含むテンプレートから名前を抽出する正常ケース。 */
    describe('When: 正常系', () => {
      for (const { id, desc, template, expected } of _normalCases) {
        it(`[Normal] ${id}: ${desc}`, () => {
          assertEquals(extractPlaceholders(template), expected);
        });
      }
    });

    /** 抽出対象が無い・形式が異なる境界ケース。 */
    describe('When: エッジケース', () => {
      for (const { id, desc, template, expected } of _edgeCases) {
        it(`[Edge] ${id}: ${desc}`, () => {
          assertEquals(extractPlaceholders(template), expected);
        });
      }
    });
  });
});
