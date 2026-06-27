// src: scripts/modules/setfm-cache.ts
// @(#): set-frontmatter フェーズ単位キャッシュ操作
//       対象: getCacheSlug / readCache / writeCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import {
  getCacheSlug,
  readCache as _readCache,
  writeCache as _writeCache,
} from '../../../_scripts/libs/cache/cache-utils.ts';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** フェーズ単位のキャッシュデータ。各フェーズ完了後に該当フィールドを追記する。 */
export interface SetfmCache {
  /** Phase 2 (judgeType) で判定した type 値。 */
  type?: string;
  /** Phase 3a (judgeCategory) で判定した category 値。 */
  category?: string;
  /** Phase 3b (generateFrontmatter) で生成したフロントマターフィールド群。 */
  frontmatter?: Record<string, string | string[]>;
}

// ─────────────────────────────────────────────
// Public API（共通ライブラリへの委譲ファサード）
// ─────────────────────────────────────────────

export { getCacheSlug };

export const readCache = (cacheDir: string, slug: string): Promise<SetfmCache> =>
  _readCache<SetfmCache>(cacheDir, slug) as Promise<SetfmCache>;

export const writeCache = (cacheDir: string, slug: string, patch: Partial<SetfmCache>): Promise<void> =>
  _writeCache<SetfmCache>(cacheDir, slug, patch);
