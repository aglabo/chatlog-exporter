// src: skills/_cle-libs/types/frontmatter.types.ts
// @(#): Frontmatter 関連型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// frontmatter フィールド型
// ─────────────────────────────────────────────

/** frontmatter フィールドの値型。スカラー文字列または文字列配列。 */
export type FrontmatterFields = Record<string, string | string[]>;

// ─────────────────────────────────────────────
// frontmatter 抽出結果系
// ─────────────────────────────────────────────

/** frontmatter 抽出結果。meta は YAML パース済みオブジェクト。 */
export type FrontmatterResult = {
  /** YAML パース済みのフロントマターフィールド。 */
  meta: Record<string, unknown>;
  /** フロントマターを除いた本文。 */
  content: string;
};

/** frontmatter フィールドを文字列または文字列配列に変換した抽出結果。 */
export type FrontmatterEntries = {
  /** 変換されたフロントマターフィールド。配列値は string[] で保持される。 */
  meta: FrontmatterFields;
  /** フロントマターを除いた本文。 */
  content: string;
};
