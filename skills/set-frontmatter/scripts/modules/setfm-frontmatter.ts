// src: scripts/modules/setfm-frontmatter.ts
// @(#): set-frontmatter Phase 3b フロントマター生成モジュール
//       対象: generateFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { cleanYaml } from '../../../_scripts/libs/text/markdown-utils.ts';

// ─── Local
import { formatEntryWithRules } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { EntryMeta } from '../types/entry-meta.types.ts';
import type { FrontmatterResult, LogType } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3b: フロントマター生成（並列）
// ─────────────────────────────────────────────

export const generateFrontmatter = async (
  fm: EntryMeta,
  type: LogType,
  category: string,
  dics: Dics,
  prompts: Prompts,
): Promise<FrontmatterResult> => {
  const tmpl = prompts.prompts.get('meta') ?? { system: '', user: '' };
  const topicList = dics.topicEntries.map(formatEntryWithRules).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    log_type: type,
    log_category: category,
    topic_list: topicList,
    tags_list: dics.tags,
    body: fm.content,
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    return { file: fm.file, type, category, yaml: '' };
  }
  return { file: fm.file, type, category, yaml: cleanYaml(raw, 'title') };
};
