// src: scripts/modules/setfm-type.ts
// @(#): set-frontmatter Phase 2 type判定モジュール
//       対象: judgeType
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// ─── Local
import { formatEntryWithRules, renderPrompt } from './setfm-ai.ts';
// types
import type { Dics } from '../types/dics.types.ts';
import type { EntryMeta } from '../types/entry-meta.types.ts';
import type { TypeResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 2: type判定（並列）
// ─────────────────────────────────────────────

export const judgeType = async (fm: EntryMeta, dics: Dics): Promise<TypeResult> => {
  const tmpl = dics.prompts.get('type') ?? { system: '', user: '' };
  const typeList = dics.typeEntries.map(formatEntryWithRules).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, { type_list: typeList, body: fm.content });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    return { file: fm.file, type: 'research' };
  }
  const normalized = raw.replace(/\s/g, '').toLowerCase();
  const validKeys = new Set(dics.typeEntries.map((e) => e.key));
  return { file: fm.file, type: validKeys.has(normalized) ? normalized : 'research' };
};
