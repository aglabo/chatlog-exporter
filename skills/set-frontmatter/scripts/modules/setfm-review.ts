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
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { extractYaml } from '../../../_scripts/libs/text/frontmatter-utils.ts';
import type { FrontmatterFields } from '../../../_scripts/types/frontmatter.types.ts';

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
  maxRetry: number,
  model?: string,
  signal?: AbortSignal,
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

  const _maxRetry = Math.min(maxRetry, 10);
  let _lastError: unknown;
  let _result: ReviewResult | undefined;

  for (let attempt = 0; attempt <= _maxRetry; attempt++) {
    // AI CLI 呼び出しのエラー（rate limit / exit failure 等）はリトライせず即 throw する。
    // YAML パース失敗のみ下で catch してリトライ対象とする。
    const _raw = await runAI(system, user, { ...(model ? { model } : {}), ...(signal ? { signal } : {}) });

    const _reviewResult = extractYaml(_raw, 'validity');
    if (!_reviewResult.ok) {
      logger.warn(`reviewFrontmatter: YAML parse failed (attempt ${attempt + 1}): ${_reviewResult.error.message}`);
      _lastError = new ChatlogError('InvalidYaml', 'ParseFailed', _reviewResult.error.message);
      continue;
    }
    const _parsed = _reviewResult.value;
    const validity = ((_parsed['validity'] as string) ?? 'pass') as 'pass' | 'fail';

    if (validity === 'pass') {
      _result = { validity: 'pass', errors: [] };
      break;
    }

    const _errorsRaw = _parsed['errors'];
    const errors = Array.isArray(_errorsRaw)
      ? _errorsRaw.map((e) => String(e)).filter(Boolean)
      : [];

    const _correctedFm = _parsed['corrected_frontmatter'];
    if (_correctedFm !== null && typeof _correctedFm === 'object' && !Array.isArray(_correctedFm)) {
      const _cfm = _correctedFm as Record<string, unknown>;
      const _corrected: FrontmatterFields = {};

      // String fields: trim and skip empty
      for (const field of ['type', 'category', 'title'] as const) {
        const v = typeof _cfm[field] === 'string' ? (_cfm[field] as string).trim() : '';
        if (v) { _corrected[field] = v; }
      }
      // Array fields: filter out empty strings
      for (const field of ['topics', 'tags'] as const) {
        const raw = _cfm[field];
        if (Array.isArray(raw)) {
          const arr = raw.map((t) => String(t)).filter(Boolean);
          if (arr.length > 0) { _corrected[field] = arr; }
        }
      }

      _result = { validity: 'corrected', errors, corrected: _corrected };
      break;
    }

    _result = { validity: 'error', errors };
    break;
  }

  if (_result === undefined) {
    return { validity: 'error', errors: ['reviewFrontmatter failed after retries'] };
  }

  return _result;
};
