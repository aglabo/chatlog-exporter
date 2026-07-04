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
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_scripts/constants/defaults.constants.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { extractYaml } from '../../../_scripts/libs/text/frontmatter-utils.ts';
// types
import type { FrontmatterFields } from '../../../_scripts/types/frontmatter.types.ts';

// ─── Local
import { formatDicEntries } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// Phase 3b: フロントマター生成（並列）
// ─────────────────────────────────────────────

export const generateFrontmatter = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
): Promise<boolean> => {
  const type = (entry.frontmatter.get('type') as string) ?? DEFAULT_FALLBACK_TYPE;
  const category = (entry.frontmatter.get('category') as string) ?? DEFAULT_FALLBACK_CATEGORY;
  const tmpl = prompts.prompts.get('meta') ?? { system: '', user: '' };
  const topicList = formatDicEntries(dics.topicEntries);
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    log_type: type,
    log_category: category,
    topic_list: topicList,
    tags_list: dics.tags,
    body: entry.truncateContent(maxContentLength),
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch (e) {
    logger.warn(`generateFrontmatter: AI call failed: ${e}`);
    return false;
  }
  const _fmResult = extractYaml(raw, 'title');
  if (!_fmResult.ok) {
    logger.warn(`generateFrontmatter: YAML parse failed: ${_fmResult.error.message}`);
    return false;
  }
  const _parsed = _fmResult.value as FrontmatterFields;
  for (const [key, val] of Object.entries(_parsed)) {
    if (key !== 'type' && key !== 'category') {
      entry.frontmatter.set(key, val);
    }
  }
  return true;
};
