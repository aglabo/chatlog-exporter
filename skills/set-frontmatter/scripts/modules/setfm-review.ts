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
import type { ChatlogFrontmatter } from '../../../_cle-libs/classes/ChatlogFrontmatter.class.ts';
import { FRONTMATTER_DELIMITER } from '../../../_cle-libs/constants/common.constants.ts';
import { DEFAULT_FALLBACK_CATEGORY, DEFAULT_FALLBACK_TYPE } from '../../../_cle-libs/constants/defaults.constants.ts';
import { LLAMA_MAX_TOKENS } from '../../../_cle-libs/constants/llama-max-tokens.constants.ts';
import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { extractYaml, reorderFrontmatterEntries } from '../../../_cle-libs/libs/text/frontmatter-utils.ts';
import { stringifyFrontmatter } from '../../../_cle-libs/libs/text/yaml-utils.ts';
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
 * 生成トークン上限は辞書に依存しない固定値 `LLAMA_MAX_TOKENS.REVIEW` とする（ai-backend DR-37）。
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
  maxTokens: LLAMA_MAX_TOKENS.REVIEW,
});

/**
 * 固定部プレースホルダ 4 本（`${type_dics}` / `${topic_list}` / `${category_list}` / `${tags_list}`）の
 * 変数マップを組み立てる。
 *
 * system 描画と user 描画の両方がこのマップを使う。導出式を 1 箇所に閉じるための関数であり、
 * 呼び出し側で `formatDicEntries` / `formatDicEntriesShort` を直接書かない。
 *
 * @param dics - 固定部プレースホルダの導出元辞書
 * @returns 固定部プレースホルダの変数マップ
 */
const _buildReviewInvariantVars = (dics: Dics): Record<string, string> => ({
  type_dics: formatDicEntries(dics.typeEntries),
  topic_list: formatDicEntriesShort(dics.topicEntries),
  category_list: dics.category,
  tags_list: dics.tags,
});

/**
 * typeEntries・topicEntries・category・tags を整形し、テンプレートに埋め込んで system prompt を生成する。
 *
 * 4 つの RULE セクションと辞書由来の値域は 1 実行のあいだ不変であり、llama-server の
 * prefix キャッシュは system メッセージ単位でしか再利用されない（DR-36）。そのため
 * 固定部のプレースホルダ 4 本は user ではなく system 側で描画する。
 *
 * @param systemTemplate - `review.yaml` の `system` テンプレート
 * @param dics - 固定部プレースホルダの導出元辞書
 * @returns 描画済み system prompt
 */
const _buildReviewSystemPrompt = (systemTemplate: string, dics: Dics): string =>
  renderPrompt(systemTemplate, _buildReviewInvariantVars(dics));

/** `${result_yaml}` に載せるフィールドと出力順。 */
const _REVIEW_RESULT_YAML_FIELDS = ['title', 'topics', 'tags'];

/**
 * `${result_yaml}` に埋め込む YAML 断片を組み立てる。
 *
 * テンプレート `review.yaml` は開始の `---` と `type` / `category` 行を自前で書くため、
 * `result_yaml` は `title` / `topics` / `tags` と終了デリミタだけを持つ。
 * フロントマター全体を渡すと `type` / `category` が重複し、ブロックが途中で閉じて
 * review 要求 10 件中 2 件で生成が止まらなくなった（cle-kju.3.3.6.1.1）。
 * テンプレート自体は変えないため、旧テンプレートでもそのまま動く。
 *
 * @param frontmatter - レビュー対象エントリのフロントマター
 * @returns `title` / `topics` / `tags`（欠落は省略）と終了デリミタからなる YAML 断片
 */
const _buildReviewResultYaml = (frontmatter: ChatlogFrontmatter): string => {
  const _fields = Object.fromEntries(
    _REVIEW_RESULT_YAML_FIELDS
      .map((key) => [key, frontmatter.get(key)] as const)
      .filter((pair): pair is readonly [string, string | string[]] => pair[1] !== undefined),
  );
  return stringifyFrontmatter(reorderFrontmatterEntries(_fields, _REVIEW_RESULT_YAML_FIELDS))
    + FRONTMATTER_DELIMITER + '\n';
};

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
  const system = _buildReviewSystemPrompt(tmpl.system, dics);
  // 固定部の変数を user 側にも渡すのは、旧 `review.yaml`（固定部が user 節に残る形）との後方互換のため。
  // `.config/chatlog-exporter/prompts/` は setup-chatlogs がディレクトリ単位でスキップするので、
  // スキルだけ更新した環境には旧テンプレートが残り、渡さないと `renderPrompt` が NotDefined で throw する。
  // `renderPrompt` はテンプレートに出現した変数しか引かないため、新テンプレートでの描画結果は変わらない
  // （PR #490 の Codex レビュー指摘 / `cle-kju.6.5`）。
  const user = renderPrompt(tmpl.user, {
    ..._buildReviewInvariantVars(dics),
    result_type: (entry.frontmatter.get('type') as string) ?? '',
    result_category: (entry.frontmatter.get('category') as string) ?? '',
    result_yaml: _buildReviewResultYaml(entry.frontmatter),
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
