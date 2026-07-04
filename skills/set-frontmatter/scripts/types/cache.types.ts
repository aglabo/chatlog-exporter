// src: scripts/types/cache.types.ts
// @(#): set-frontmatter キャッシュデータ型定義
//       対象: SetfmCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

import type { CacheStatus } from '../../../_scripts/types/cache-status.const.types.ts';
import type { FrontmatterFields } from '../../../_scripts/types/frontmatter.types.ts';

/** フェーズ単位のキャッシュデータ。各フェーズ完了後に該当フィールドを追記する。 */
export interface SetfmCache {
  /** Phase 2 (judgeType) で判定した type 値。 */
  type?: string;
  /** Phase 3a (judgeCategory) で判定した category 値。 */
  category?: string;
  /** Phase 3b (generateFrontmatter) で生成したフロントマターフィールド群。 */
  frontmatter?: FrontmatterFields;
  /** Phase 4 (applyActions) で記録した処理結果ステータス。`'reviewed'` は Phase 3.5 合格後、`'review-failed'` は Phase 3.5 不合格後、`'written'` は Phase 4 書き込み成功後、`'need-review'` は要レビュー判定後にセットされる。 */
  status?: CacheStatus;
}
