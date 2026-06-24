// src: scripts/modules/setfm-category.ts
// @(#): set-frontmatter Phase 3a category判定モジュール
//       対象: judgeCategory
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_scripts/constants/defaults.constants.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// ─── Local
import { formatDicEntries } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { LogType } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3a: category判定（並列）
// ─────────────────────────────────────────────

/** categoryEntries を formatDicEntries で整形し、テンプレートに埋め込んで system prompt を生成する。 */
const _buildCategorySystemPrompt = (systemTemplate: string, dics: Dics): string => {
  const _categoryDics = formatDicEntries(dics.categoryEntries);
  return renderPrompt(systemTemplate, { category_dics: _categoryDics });
};

export const judgeCategory = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
): Promise<void> => {
  const tmpl = prompts.prompts.get('category');
  if (!tmpl) {
    throw new ChatlogError('InvalidArgs', 'NotDefined', 'プロンプトテンプレート "category" が定義されていません');
  }
  const type = (entry.frontmatter.get('type') as LogType) ?? DEFAULT_FALLBACK_TYPE;
  const focusGuide = prompts.categoryPrompts.get(type) ?? '';
  const system = _buildCategorySystemPrompt(tmpl.system, dics);
  const user = renderPrompt(tmpl.user, {
    focus_guide: focusGuide,
    body: entry.truncateContent(maxContentLength),
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    entry.frontmatter.set('category', DEFAULT_FALLBACK_CATEGORY);
    return;
  }
  const normalized = raw.replace(/\s/g, '').toLowerCase();
  const valid = new Set(dics.category.split(','));
  const category = valid.has(normalized) ? normalized : DEFAULT_FALLBACK_CATEGORY;
  entry.frontmatter.set('category', category);
};

// ─── Test exports (テスト専用・本番コードから import 禁止)
/** テスト専用エクスポート: `_buildCategorySystemPrompt` を直接テストするためのラッパー。 */
export const _buildCategorySystemPromptForTest = _buildCategorySystemPrompt;
