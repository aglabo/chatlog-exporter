// src: scripts/constants/prompt-template.constants.ts
// @(#): set-frontmatter プロンプトテンプレートの固定部プレースホルダ定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// 固定部プレースホルダ
// ─────────────────────────────────────────────

/**
 * テンプレート名ごとの固定部プレースホルダ（辞書由来で 1 実行のあいだ不変な変数）。
 *
 * llama-server の prefix キャッシュは system メッセージ単位でしか再利用されないため、
 * これらは `system` 節で描画しなければならない（DR-36）。
 * `user` 節にこれらが現れるテンプレートは DR-36 以前の旧形式であり、描画は成功するが
 * キャッシュが効かない。`loadPrompts` はこの定数を基準に旧形式を検出して warn する（`cle-kju.6.6`）。
 */
export const PROMPT_INVARIANT_VARS = {
  meta: ['topic_list', 'tags_list'],
  review: ['type_dics', 'topic_list', 'category_list', 'tags_list'],
} as const;

/** `meta` テンプレートの固定部プレースホルダ名。 */
export type MetaInvariantVar = typeof PROMPT_INVARIANT_VARS.meta[number];

/** `review` テンプレートの固定部プレースホルダ名。 */
export type ReviewInvariantVar = typeof PROMPT_INVARIANT_VARS.review[number];
