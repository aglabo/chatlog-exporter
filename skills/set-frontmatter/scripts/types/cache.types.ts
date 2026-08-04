// src: scripts/types/cache.types.ts
// @(#): set-frontmatter キャッシュデータ型定義
//       対象: SetfmCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

import type { FrontmatterFields } from '../../../_cle-libs/types/frontmatter.types.ts';
import type { SetfmCacheStatus } from './cache.const.type.ts';

/** フェーズ単位のキャッシュデータ。各フェーズ完了後に該当フィールドを追記する。 */
export interface SetfmCache {
  /** Phase 2 (judgeType) で判定した type 値。 */
  type?: string;
  /** Phase 3a (judgeCategory) で判定した category 値。 */
  category?: string;
  /** Phase 3b (generateFrontmatter) で生成したフロントマターフィールド群。 */
  frontmatter?: FrontmatterFields;
  /** 処理の到達段階を表すステータス。`'type-category'` は Phase 2.1 完了後、`'frontmatter'` は Phase 2.2 完了後、`'reviewed'` は Phase 3.1 合格後、`'review-failed'` は Phase 3.1 不合格後、`'written'` は Phase 4.1 書き込み成功後にセットされる。 */
  status?: SetfmCacheStatus;
}
