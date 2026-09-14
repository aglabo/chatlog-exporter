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
import { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_cle-libs/constants/defaults.constants.ts';
import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { extractYaml, hasFrontmatterFields } from '../../../_cle-libs/libs/text/frontmatter-utils.ts';
// types
import type { FrontmatterFields } from '../../../_cle-libs/types/frontmatter.types.ts';
import type { OutputContract } from '../../../_cle-libs/types/json-schema.types.ts';
import type { AiRunnerProvider } from '../../../_cle-libs/types/providers.types.ts';

// ─── Local
import { formatDicEntries } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// Phase 3b: フロントマター生成（並列）
// ─────────────────────────────────────────────

/**
 * フロントマター生成の AI 応答に適用する出力契約（structured-output §4.3.1 #4）を組み立てる。
 * `topics` / `tags` は配列要素の enum であり、フォールバック値を持たない。`topics` は非空必須、`tags` は該当なしを空配列で表す。
 * `tags` 辞書の空要素（空辞書・連続 / 末尾カンマ）は値域に含めない。
 *
 * @param dics - 値域の導出元辞書（`topicEntries` のキー、`tags` のカンマ区切り文字列）
 * @returns `generateFrontmatter` が `aiRunnerProvider` へ渡す出力契約
 */
export const buildFrontmatterOutputContract = (dics: Dics): OutputContract => ({
  contract: 'yaml',
  firstField: 'title',
  properties: {
    title: { type: 'string' },
    topics: { type: 'array', items: { type: 'string', values: dics.topicEntries.map((e) => e.key) } },
    tags: { type: 'array', items: { type: 'string', values: dics.tags.split(',').filter(Boolean) } },
  },
});

export const generateFrontmatter = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
  model?: string,
  signal?: AbortSignal,
  aiRunnerProvider: AiRunnerProvider = runAI,
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

  const _outputContract = buildFrontmatterOutputContract(dics);
  const _maxRetry = Math.min(maxRetry, 10);
  let _lastError: unknown;
  let _parsed: FrontmatterFields | undefined;

  for (let attempt = 0; attempt <= _maxRetry; attempt++) {
    // AI CLI 呼び出しのエラー（rate limit / exit failure 等）はリトライせず即 throw する。
    // YAML パース失敗のみ下で catch してリトライ対象とする。
    const _raw = await aiRunnerProvider(system, user, {
      ...(model ? { model } : {}),
      ...(signal ? { signal } : {}),
      outputContract: _outputContract,
    });
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

  if (!hasFrontmatterFields(_parsed, { title: 'string', topics: 'nonEmptyArray', tags: 'array' })) {
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
