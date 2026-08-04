// src: scripts/modules/setfm-type-category.ts
// @(#): set-frontmatter Phase 2+3a type・category同時判定モジュール
//       対象: judgeTypeAndCategory
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
import { LOGGER_TEXT } from '../../../_cle-libs/constants/logger.constants.ts';
import { isFatalAiError, isRateLimitError } from '../../../_cle-libs/libs/ai/rate-limit-utils.ts';
import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { getFilename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';

// ─── Local
import { formatDicEntries } from '../libs/dic-format-utils.ts';
import { renderPrompt } from '../libs/template-utils.ts';
// types
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// Phase 2+3a: type・category 同時判定（1ファイル単位）
// ─────────────────────────────────────────────

/**
 * typeEntries・categoryEntries・categoryRules を整形し、テンプレートに埋め込んで system prompt を生成する。
 * category_rules は全 type のガイドを連結した文字列。
 */
const _buildTypeCategorySystemPrompt = (systemTemplate: string, dics: Dics, categoryRules: string): string => {
  const _typeDics = formatDicEntries(dics.typeEntries);
  const _categoryDics = formatDicEntries(dics.categoryEntries);
  return renderPrompt(systemTemplate, {
    type_dics: _typeDics,
    category_dics: _categoryDics,
    category_rules: categoryRules,
  });
};

/**
 * type と category を 1回の AI 呼び出しで同時判定し、entry.frontmatter に書き込む。
 *
 * AI レスポンス形式:
 * ```
 * type: <type_key>
 * category: <category_key>
 * ```
 *
 * 判定失敗（有効キー不一致など）時はフォールバック値をセットする。
 * ただしエラー種別により挙動を分ける:
 * - RateLimit / abort 済み signal → 例外を再 throw して中断する。
 * - 非 RateLimit の AI エラー（exit failure 等）→ `logger.error` を出し、type/category を書かず skip する。
 * - 非 AiError（パース失敗等）→ フォールバック値をセットする（後方互換）。
 */
export const judgeTypeAndCategory = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  model?: string,
  signal?: AbortSignal,
): Promise<void> => {
  const tmpl = prompts.prompts.get('type-category');
  if (!tmpl) {
    throw new ChatlogError(
      'InvalidArgs',
      'NotDefined',
      'プロンプトテンプレート "type-category" が定義されていません',
    );
  }

  const _categoryRules = Array.from(prompts.categoryPrompts.values()).join('\n\n');
  const _system = _buildTypeCategorySystemPrompt(tmpl.system, dics, _categoryRules);
  const _user = renderPrompt(tmpl.user, {
    entries: entry.truncateContent(maxContentLength),
  });

  const _validTypes = new Set(dics.typeEntries.map((e) => e.key));
  const _validCategories = new Set(dics.category.split(','));

  let type = DEFAULT_FALLBACK_TYPE;
  let category = DEFAULT_FALLBACK_CATEGORY;

  try {
    const _raw = await runAI(_system, _user, { ...(model ? { model } : {}), ...(signal ? { signal } : {}) });
    const _lines = _raw.trim().split('\n');
    const _typeMatch = _lines.find((l) => l.startsWith('type:'));
    const _catMatch = _lines.find((l) => l.startsWith('category:'));

    const _parsedType = _typeMatch ? _typeMatch.replace('type:', '').trim().toLowerCase() : '';
    const _parsedCategory = _catMatch ? _catMatch.replace('category:', '').trim().toLowerCase() : '';

    if (_parsedType && _validTypes.has(_parsedType)) {
      type = _parsedType;
    }
    if (_parsedCategory && _validCategories.has(_parsedCategory)) {
      category = _parsedCategory;
    }
  } catch (e) {
    // RateLimit / 外部 abort → 中断（isRateLimitError を isFatalAiError より先に判定する）
    if (isRateLimitError(e) || signal?.aborted) {
      throw e;
    }
    // 非 RateLimit の AI エラー → error ログを出し type/category を書かず skip
    if (isFatalAiError(e)) {
      logger.error(`${LOGGER_TEXT.INDENT}FAIL (type/category 判定失敗): ${getFilename(entry.filePath!)} — ${e}`);
      return;
    }
    // 非 AiError（パース失敗等）→ フォールバック値をセット（後方互換）
    type = DEFAULT_FALLBACK_TYPE;
    category = DEFAULT_FALLBACK_CATEGORY;
  }

  entry.frontmatter.set('type', type);
  entry.frontmatter.set('category', category);
};

// ─── Test exports (テスト専用・本番コードから import 禁止)
/** テスト専用エクスポート: `_buildTypeCategorySystemPrompt` を直接テストするためのラッパー。categoryRules を受け取る。 */
export const _buildTypeCategorySystemPromptForTest = _buildTypeCategorySystemPrompt;
