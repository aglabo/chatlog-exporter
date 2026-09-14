// src: scripts/modules/setfm-review.ts
// @(#): set-frontmatter Phase 3.5 フロントマターレビューモジュール
//       対象: reviewFrontmatter, buildReviewOutputContract
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_cle-libs/constants/defaults.constants.ts';
import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { extractYaml } from '../../../_cle-libs/libs/text/frontmatter-utils.ts';
// types
import type { FrontmatterFields } from '../../../_cle-libs/types/frontmatter.types.ts';
import type { OutputContract } from '../../../_cle-libs/types/json-schema.types.ts';
import type { AiRunnerProvider } from '../../../_cle-libs/types/providers.types.ts';

// ─── Local
import { formatDicEntries, formatDicEntriesShort } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { ReviewResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 3.5: フロントマターレビュー（並列）
// ─────────────────────────────────────────────

/**
 * フロントマターレビューの AI 応答に適用する出力契約（structured-output §4.3.1 #5）を組み立てる。
 * `corrected_frontmatter` の `type` / `category` は #6 と同じ値域・フォールバック値を持ち、
 * `topics` / `tags` は配列要素の enum としてフォールバック値を持たない。`topics` は非空必須、`tags` は該当なしを空配列で表す。
 * `tags` は空辞書を空値域として許容するため空要素を除去する。`category` も空要素を除去し、
 * 空辞書（空値域）を起動時の設定エラーとして `assertOutputContractValues` に検出させる。
 */
export const buildReviewOutputContract = (dics: Dics): OutputContract => ({
  contract: 'yaml',
  firstField: 'validity',
  properties: {
    validity: { type: 'string', values: ['pass', 'fail'], fallback: 'pass' },
    errors: { type: 'array', items: { type: 'string' } },
    corrected_frontmatter: {
      type: 'object',
      properties: {
        type: { type: 'string', values: dics.typeEntries.map((e) => e.key), fallback: DEFAULT_FALLBACK_TYPE },
        category: {
          type: 'string',
          values: dics.category.split(',').filter(Boolean),
          fallback: DEFAULT_FALLBACK_CATEGORY,
        },
        title: { type: 'string' },
        topics: { type: 'array', items: { type: 'string', values: dics.topicEntries.map((e) => e.key) } },
        tags: { type: 'array', items: { type: 'string', values: dics.tags.split(',').filter(Boolean) } },
      },
    },
  },
});

export const reviewFrontmatter = async (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
  model?: string,
  signal?: AbortSignal,
  aiRunnerProvider: AiRunnerProvider = runAI,
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

  const _outputContract = buildReviewOutputContract(dics);
  const _maxRetry = Math.min(maxRetry, 10);
  let _lastError: unknown;
  let _result: ReviewResult | undefined;

  for (let attempt = 0; attempt <= _maxRetry; attempt++) {
    // AI CLI 呼び出しのエラー（rate limit / exit failure 等）はリトライせず即 throw する。
    // YAML パース失敗のみ下で catch してリトライ対象とする。
    const _raw = await aiRunnerProvider(system, user, {
      ...(model ? { model } : {}),
      ...(signal ? { signal } : {}),
      outputContract: _outputContract,
    });

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
          _corrected[field] = raw.map((t) => String(t)).filter(Boolean);
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
