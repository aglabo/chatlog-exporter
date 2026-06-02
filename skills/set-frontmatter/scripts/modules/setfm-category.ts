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
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// ─── Local
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { LogType } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3a: category判定（並列）
// ─────────────────────────────────────────────

export const judgeCategory = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  type: LogType,
  dics: Dics,
  prompts: Prompts,
): Promise<string> => {
  const tmpl = prompts.prompts.get('category') ?? { system: '', user: '' };
  const focusGuide = prompts.categoryPrompts.get(type) ?? '';
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    category_list: dics.category,
    focus_guide: focusGuide,
    body: entry.truncateContent(maxContentLength),
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    return 'development';
  }
  const normalized = raw.replace(/\s/g, '').toLowerCase();
  const valid = new Set(dics.category.split(','));
  return valid.has(normalized) ? normalized : 'development';
};
