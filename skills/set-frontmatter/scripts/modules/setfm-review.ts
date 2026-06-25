// src: scripts/modules/setfm-review.ts
// @(#): set-frontmatter Phase 3.5 フロントマターレビューモジュール
//       対象: reviewFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { cleanYaml } from '../../../_scripts/libs/text/markdown-utils.ts';

// ─── Local
import { formatDicEntries, formatDicEntriesShort } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { ReviewResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3.5: フロントマターレビュー（並列）
// ─────────────────────────────────────────────

export const reviewFrontmatter = async (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
): Promise<ReviewResult> => {
  const tmpl = prompts.prompts.get('review') ?? { system: '', user: '' };
  const typeList = formatDicEntries(dics.typeEntries);
  const topicList = formatDicEntriesShort(dics.topicEntries);
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    type_dics: typeList,
    topic_list: topicList,
    category_list: dics.category,
    tags_list: dics.tags,
    result_type: (entry.frontmatter.get('type') as string) ?? '',
    result_category: (entry.frontmatter.get('category') as string) ?? '',
    result_yaml: entry.frontmatter.toFrontmatter(),
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    return { validity: 'pass', errors: [] };
  }

  const _cleaned = cleanYaml(raw, 'validity');

  const validityMatch = _cleaned.match(/^validity:\s*(pass|fail)/m);
  const validity = (validityMatch?.[1] ?? 'pass') as 'pass' | 'fail';

  if (validity === 'pass') {
    return { validity: 'pass', errors: [] };
  }

  const errorsMatch = _cleaned.match(/^errors:\s*\n((?: {2}- .+\n?)*)/m);
  const errors = errorsMatch
    ? errorsMatch[1].split('\n').map((l) => l.replace(/^ {2}- /, '').trim()).filter(Boolean)
    : [];

  const typeMatch = _cleaned.match(/^ {2}type:\s*(\S+)/m);
  const correctedType = typeMatch?.[1]?.trim() ?? '';
  if (correctedType) { entry.frontmatter.set('type', correctedType); }

  const categoryMatch = _cleaned.match(/^ {2}category:\s*(\S+)/m);
  const correctedCategory = categoryMatch?.[1]?.trim() ?? '';
  if (correctedCategory) { entry.frontmatter.set('category', correctedCategory); }

  return { validity, errors };
};
