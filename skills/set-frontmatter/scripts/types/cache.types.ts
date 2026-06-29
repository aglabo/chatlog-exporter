// src: scripts/types/cache.types.ts
// @(#): set-frontmatter キャッシュデータ型定義
//       対象: SetfmCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

/** フェーズ単位のキャッシュデータ。各フェーズ完了後に該当フィールドを追記する。 */
export interface SetfmCache {
  /** Phase 2 (judgeType) で判定した type 値。 */
  type?: string;
  /** Phase 3a (judgeCategory) で判定した category 値。 */
  category?: string;
  /** Phase 3b (generateFrontmatter) で生成したフロントマターフィールド群。 */
  frontmatter?: Record<string, string | string[]>;
}
