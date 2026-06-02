// src: scripts/modules/setfm-type.ts
// @(#): set-frontmatter Phase 2 type判定モジュール（バッチ処理）
//       対象: judgeType
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { parseAiJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// ─── Local
import { formatEntryWithRules } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { TypeResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 2: type判定（バッチ）
// ─────────────────────────────────────────────

export const judgeType = async (
  entries: ChatlogEntry[],
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
): Promise<TypeResult[]> => {
  const tmpl = prompts.prompts.get('type') ?? { system: '', user: '' };
  const typeList = dics.typeEntries.map(formatEntryWithRules).join('\n');
  const entriesText = entries
    .map((entry, i) =>
      `=== FILE ${i + 1}: ${getFilename(entry.filePath!)} ===\n${entry.truncateContent(maxContentLength)}`
    )
    .join('\n\n');
  const system = renderPrompt(tmpl.system, { type_dics: typeList });
  const user = renderPrompt(tmpl.user, { entries: entriesText });
  const validKeys = new Set(dics.typeEntries.map((e) => e.key));

  let parsed: { file: string; type: string }[] | null = null;
  try {
    const raw = await runAI(system, user);
    parsed = parseAiJsonArray<{ file: string; type: string }>(raw);
  } catch {
    // fall through to fallback
  }

  return entries.map((entry) => {
    const filename = getFilename(entry.filePath!);
    const match = parsed?.find((r) => r.file === filename);
    const normalized = match?.type.replace(/\s/g, '').toLowerCase() ?? '';
    return { file: entry.filePath!, type: validKeys.has(normalized) ? normalized : 'research' };
  });
};
