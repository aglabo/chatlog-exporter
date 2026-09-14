// src: scripts/modules/setfm-type-category.ts
// @(#): set-frontmatter Phase 2+3a type・category同時判定モジュール
//       対象: judgeTypeAndCategory, buildTypeCategoryOutputContract
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
import { isAbortingAiError } from '../../../_cle-libs/libs/ai/abort-utils.ts';
import { isFatalAiError } from '../../../_cle-libs/libs/ai/rate-limit-utils.ts';
import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { getFilename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// types
import type { OutputContract } from '../../../_cle-libs/types/json-schema.types.ts';
import type { AiRunnerProvider } from '../../../_cle-libs/types/providers.types.ts';

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
 * type・category の値域を辞書から導出する。応答の照合と出力契約の両方がこの値域を使う。
 * category は `,` 分割後に空要素を除去する。空辞書は空値域となり、起動時検証で拒否される。
 */
const _typeCategoryValues = (dics: Dics): { typeValues: string[]; categoryValues: string[] } => ({
  typeValues: dics.typeEntries.map((e) => e.key),
  categoryValues: dics.category.split(',').filter(Boolean),
});

/**
 * type・category 判定の AI 応答に適用する出力契約（structured-output §4.3.1 #6）を組み立てる。
 * 値域は `_typeCategoryValues` で導出し、フォールバック値は
 * `DEFAULT_FALLBACK_TYPE` / `DEFAULT_FALLBACK_CATEGORY` とする。
 */
export const buildTypeCategoryOutputContract = (dics: Dics): OutputContract => {
  const { typeValues, categoryValues } = _typeCategoryValues(dics);
  return {
    contract: 'line-prefixed',
    properties: {
      type: { type: 'string', values: typeValues, fallback: DEFAULT_FALLBACK_TYPE },
      category: { type: 'string', values: categoryValues, fallback: DEFAULT_FALLBACK_CATEGORY },
    },
  };
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
 * - 中断側 subindex（RateLimit / InvalidEndpoint / BackendUnavailable /
 *   ResponseFormatRejected）または abort 済み signal → 例外を再 throw して中断する。
 * - 続行側の AI エラー（ExitFailure 等）→ `logger.error` を出し、type/category を書かず skip する。
 * - 非 AiError（パース失敗等）→ フォールバック値をセットする（後方互換）。
 *
 * @returns type/category を書き込めたとき `true`、続行側 AI エラーで skip したとき `false`
 */
export const judgeTypeAndCategory = async (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  model?: string,
  signal?: AbortSignal,
  aiRunnerProvider: AiRunnerProvider = runAI,
): Promise<boolean> => {
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

  const { typeValues, categoryValues } = _typeCategoryValues(dics);
  const _validTypes = new Set(typeValues);
  const _validCategories = new Set(categoryValues);

  let type = DEFAULT_FALLBACK_TYPE;
  let category = DEFAULT_FALLBACK_CATEGORY;

  try {
    const _raw = await aiRunnerProvider(_system, _user, {
      ...(model ? { model } : {}),
      ...(signal ? { signal } : {}),
      outputContract: buildTypeCategoryOutputContract(dics),
    });
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
    // 中断側 subindex / 外部 abort → バッチを止める（AC-019）
    if (isAbortingAiError(e) || signal?.aborted) {
      throw e;
    }
    // 続行側の AI エラー → error ログを出し type/category を書かず skip（AC-023）
    if (isFatalAiError(e)) {
      logger.error(`${LOGGER_TEXT.INDENT}FAIL (type/category 判定失敗): ${getFilename(entry.filePath!)} — ${e}`);
      return false;
    }
    // 非 AiError（パース失敗等）→ フォールバック値をセット（後方互換）
    type = DEFAULT_FALLBACK_TYPE;
    category = DEFAULT_FALLBACK_CATEGORY;
  }

  entry.frontmatter.set('type', type);
  entry.frontmatter.set('category', category);
  return true;
};

// ─── Test exports (テスト専用・本番コードから import 禁止)
/** テスト専用エクスポート: `_buildTypeCategorySystemPrompt` を直接テストするためのラッパー。categoryRules を受け取る。 */
export const _buildTypeCategorySystemPromptForTest = _buildTypeCategorySystemPrompt;
