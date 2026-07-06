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
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_scripts/constants/defaults.constants.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { extractYaml, hasFrontmatterFields } from '../../../_scripts/libs/text/frontmatter-utils.ts';
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
  maxRetry: number,
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

  const _maxRetry = Math.min(maxRetry, 10);
  let _lastError: unknown;
  let _parsed: FrontmatterFields | undefined;

  for (let attempt = 0; attempt <= _maxRetry; attempt++) {
    let _raw: string;
    try {
      _raw = await runAI(system, user);
    } catch (e) {
      if (e instanceof ChatlogError && e.kind === 'AiError') {
        logger.warn(`generateFrontmatter: AI call failed (attempt ${attempt + 1}): ${e}`);
        _lastError = e;
        continue;
      }
      throw e;
    }
    const _fmResult = extractYaml(_raw, 'title');
    if (!_fmResult.ok) {
      logger.warn(`generateFrontmatter: YAML parse failed (attempt ${attempt + 1}): ${_fmResult.error.message}`);
      _lastError = new ChatlogError('InvalidYaml', 'ParseFailed', _fmResult.error.message);
      continue;
    }
    _parsed = _fmResult.value as FrontmatterFields;
    break;
  }

  if (_parsed === undefined) {
    throw _lastError ?? new ChatlogError('InvalidYaml', 'ParseFailed', 'generateFrontmatter failed after retries');
  }

  if (!hasFrontmatterFields(_parsed, { title: 'string', topics: 'array', tags: 'array' })) {
    logger.warn(`generateFrontmatter: generated frontmatter missing required fields`);
    return false;
  }
  for (const [key, val] of Object.entries(_parsed)) {
    if (key !== 'type' && key !== 'category') {
      entry.frontmatter.set(key, val);
    }
  }
  return true;
};
