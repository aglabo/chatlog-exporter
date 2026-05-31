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
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// ─── Local
import { formatEntryShort, formatEntryWithRules, renderPrompt } from './setfm-ai.ts';
// types
import type { Dics } from '../types/dics.types.ts';
import type { FrontmatterResult, ReviewResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3.5: フロントマターレビュー（並列）
// ─────────────────────────────────────────────

export const reviewFrontmatter = async (
  result: FrontmatterResult,
  dics: Dics,
): Promise<ReviewResult> => {
  const tmpl = dics.prompts.get('review') ?? { system: '', user: '' };
  const typeList = dics.typeEntries.map(formatEntryWithRules).join('\n');
  const topicList = dics.topicEntries.map(formatEntryShort).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    type_list: typeList,
    topic_list: topicList,
    category_list: dics.category,
    tags_list: dics.tags,
    result_type: result.type,
    result_category: result.category,
    result_yaml: result.yaml,
  });
  let raw: string;
  try {
    raw = await runAI(system, user);
  } catch {
    return {
      file: result.file,
      validity: 'pass',
      errors: [],
      correctedType: '',
      correctedCategory: '',
      correctedYaml: '',
    };
  }

  const _cleaned = raw.split('\n').filter((l) => !l.startsWith('```')).join('\n').trim();

  const validityMatch = _cleaned.match(/^validity:\s*(pass|fail)/m);
  const validity = (validityMatch?.[1] ?? 'pass') as 'pass' | 'fail';

  if (validity === 'pass') {
    return {
      file: result.file,
      validity: 'pass',
      errors: [],
      correctedType: '',
      correctedCategory: '',
      correctedYaml: '',
    };
  }

  const errorsMatch = _cleaned.match(/^errors:\s*\n((?: {2}- .+\n?)*)/m);
  const errors = errorsMatch
    ? errorsMatch[1].split('\n').map((l) => l.replace(/^ {2}- /, '').trim()).filter(Boolean)
    : [];

  const typeMatch = _cleaned.match(/^ {2}type:\s*(\S+)/m);
  const correctedType = typeMatch?.[1]?.trim() ?? '';

  const categoryMatch = _cleaned.match(/^ {2}category:\s*(\S+)/m);
  const correctedCategory = categoryMatch?.[1]?.trim() ?? '';

  const correctedYaml = _cleaned
    .replace(/^[\s\S]*?(^ {2}title:)/m, '$1')
    .split('\n')
    .map((l) => l.replace(/^ {2}/, ''))
    .join('\n')
    .trim();

  return { file: result.file, validity, errors, correctedType, correctedCategory, correctedYaml };
};
