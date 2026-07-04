// src: skills/_scripts/constants/common.constants.ts
// @(#): スクリプト共通定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** Markdown フロントマターの開始・終了区切り文字。 */
export const FRONTMATTER_DELIMITER = '---';

/** frontmatter 必須フィールドの名前と期待する値の型のマップ。 */
export const FM_FIELD_TYPES = {
  type: 'string',
  category: 'string',
  title: 'string',
  topics: 'array',
  tags: 'array',
} as const satisfies Record<string, 'string' | 'array'>;
