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
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { extractYaml } from '../../../_scripts/libs/text/frontmatter-utils.ts';

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
  } catch (e) {
    logger.warn(`reviewFrontmatter: AI call failed: ${e}`);
    return { validity: 'pass', errors: [] };
  }

  const _reviewResult = extractYaml(raw, 'validity');
  if (!_reviewResult.ok) {
    logger.warn(`reviewFrontmatter: YAML parse failed: ${_reviewResult.error.message}`);
    return { validity: 'fail', errors: [`YAML parse failed: ${_reviewResult.error.message}`] };
  }
  const _parsed = _reviewResult.value;

  const validity = ((_parsed['validity'] as string) ?? 'pass') as 'pass' | 'fail';

  if (validity === 'pass') {
    return { validity: 'pass', errors: [] };
  }

  const _errorsRaw = _parsed['errors'];
  const errors = Array.isArray(_errorsRaw)
    ? _errorsRaw.map((e) => String(e)).filter(Boolean)
    : [];

  const _corrected = _parsed['corrected'];
  if (_corrected !== null && typeof _corrected === 'object' && !Array.isArray(_corrected)) {
    const _c = _corrected as Record<string, unknown>;
    const correctedType = typeof _c['type'] === 'string' ? _c['type'].trim() : '';
    if (correctedType) { entry.frontmatter.set('type', correctedType); }

    const correctedCategory = typeof _c['category'] === 'string' ? _c['category'].trim() : '';
    if (correctedCategory) { entry.frontmatter.set('category', correctedCategory); }
  }

  const _correctedFm = _parsed['corrected_frontmatter'];
  if (_correctedFm !== null && typeof _correctedFm === 'object' && !Array.isArray(_correctedFm)) {
    const _cfm = _correctedFm as Record<string, unknown>;
    const _topicsRaw = _cfm['topics'];
    if (Array.isArray(_topicsRaw)) {
      const correctedTopics = _topicsRaw.map((t) => String(t)).filter(Boolean);
      if (correctedTopics.length > 0) { entry.frontmatter.set('topics', correctedTopics); }
    }

    const _tagsRaw = _cfm['tags'];
    if (Array.isArray(_tagsRaw)) {
      const correctedTags = _tagsRaw.map((t) => String(t)).filter(Boolean);
      if (correctedTags.length > 0) { entry.frontmatter.set('tags', correctedTags); }
    }
  }

  return { validity, errors };
};
