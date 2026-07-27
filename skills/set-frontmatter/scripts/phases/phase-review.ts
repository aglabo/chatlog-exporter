// src: scripts/phases/phase-review.ts
// @(#): フロントマターレビューフェーズ（Phase 3.1）
//       対象: phaseReview
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import { isFatalAiError } from '../../../_scripts/libs/ai/rate-limit-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { reviewFrontmatter } from '../modules/setfm-review.ts';
import { extractEntryFrontmatter, filterFrontmatterFields } from '../modules/setfm-write.ts';
import type { SetfmConfig } from '../types/args.types.ts';
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { ReviewResult } from '../types/phase.types.ts';

// ─── Internal types
type _ReviewProvider = (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
  model?: string,
  signal?: AbortSignal,
) => Promise<ReviewResult>;

/**
 * 再実行時にレビュー AI を呼ぶ必要があるかを entry と cache から純粋判定する。
 *
 * キャッシュ status が `REVIEWED` 以外のとき `true`（AI レビューが必要）。
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @returns AI レビューが必要なら `true`
 */
export const needsReviewAi = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): boolean => {
  return cache.read(entry.filePath!).status !== SETFM_CACHE_STATUSES.REVIEWED;
};

export const phaseReview = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  dics: Dics,
  prompts: Prompts,
  config: Pick<SetfmConfig, 'concurrency' | 'dryRun' | 'model'> & Partial<Pick<SetfmConfig, 'maxRetry'>>,
  reviewProvider?: _ReviewProvider,
): Promise<void> => {
  const _hits = entries.filter((e) => !needsReviewAi(e, cache));
  const _misses = entries.filter((e) => needsReviewAi(e, cache));

  _hits.forEach((e) => {
    logger.info(`${LOGGER_TEXT.INDENT}review (cached): ${getFilename(e.filePath!)}`);
  });

  const _review = reviewProvider ?? reviewFrontmatter;
  await runConcurrent(
    _misses,
    async (entry, ctl) => {
      if (config.dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}review: ${getFilename(entry.filePath!)}`);
      } else {
        let r: ReviewResult;
        try {
          r = await _review(entry, dics, prompts, config.maxRetry ?? 0, config.model, ctl.signal);
        } catch (e) {
          if (isFatalAiError(e) || ctl.signal.aborted) {
            throw e;
          }
          logger.warn(`${LOGGER_TEXT.INDENT}FAIL (review 失敗): ${getFilename(entry.filePath!)} — ${e}`);
          return;
        }
        if (r.validity === 'pass') {
          logger.info(`${LOGGER_TEXT.INDENT}review OK: ${getFilename(entry.filePath!)}`);
          const _existing = cache.read(entry.filePath!);
          const _fmSnapshot = { ...(_existing.frontmatter ?? {}), ...extractEntryFrontmatter(entry) };
          const _correctedType = (entry.frontmatter.get('type') as string | undefined) ?? _existing.type;
          const _correctedCategory = (entry.frontmatter.get('category') as string | undefined) ?? _existing.category;
          await cache.write(entry.filePath!, {
            ..._existing,
            type: _correctedType,
            category: _correctedCategory,
            frontmatter: _fmSnapshot,
            status: SETFM_CACHE_STATUSES.REVIEWED,
          });
        } else if (r.validity === 'corrected') {
          logger.info(`${LOGGER_TEXT.INDENT}review corrected: ${getFilename(entry.filePath!)}`);
          const _existing = cache.read(entry.filePath!);
          const _filtered = filterFrontmatterFields(r.corrected ?? {});
          const _fmSnapshot = { ...(_existing.frontmatter ?? {}), ..._filtered };
          const _correctedType = (_filtered['type'] as string | undefined) ?? _existing.type;
          const _correctedCategory = (_filtered['category'] as string | undefined) ?? _existing.category;
          await cache.write(entry.filePath!, {
            ..._existing,
            type: _correctedType,
            category: _correctedCategory,
            frontmatter: _fmSnapshot,
            status: SETFM_CACHE_STATUSES.REVIEWED,
          });
        } else {
          // r.validity === 'error'
          logger.warn(`${LOGGER_TEXT.INDENT}review error: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
          const _existing = cache.read(entry.filePath!);
          await cache.write(entry.filePath!, {
            ..._existing,
            status: SETFM_CACHE_STATUSES.REVIEW_FAILED,
          });
        }
      }
    },
    config.concurrency,
  );
};
