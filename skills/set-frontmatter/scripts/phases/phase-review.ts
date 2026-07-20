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
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { CACHE_STATUSES } from '../../../_scripts/types/cache-status.const.types.ts';
// ─── Local
import { reviewFrontmatter } from '../modules/setfm-review.ts';
import { extractEntryFrontmatter, filterFrontmatterFields } from '../modules/setfm-write.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';
import type { ReviewResult } from '../types/phase.types.ts';

// ─── Internal types
type _ReviewProvider = (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
) => Promise<ReviewResult>;

export const phaseReview = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  reviewProvider?: _ReviewProvider,
  maxRetry = 0,
): Promise<void> => {
  const _hits = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  const _misses = entries.filter((e) => cache.read(e.filePath!).status !== CACHE_STATUSES.REVIEWED);

  _hits.forEach((e) => {
    logger.info(`${LOGGER_TEXT.INDENT}review (cached): ${getFilename(e.filePath!)}`);
  });

  const _review = reviewProvider ?? reviewFrontmatter;
  await runConcurrent(
    _misses,
    async (entry) => {
      if (dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}review: ${getFilename(entry.filePath!)}`);
      } else {
        let r: ReviewResult;
        try {
          r = await _review(entry, dics, prompts, maxRetry);
        } catch (e) {
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
            status: CACHE_STATUSES.REVIEWED,
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
            status: CACHE_STATUSES.REVIEWED,
          });
        } else {
          // r.validity === 'error'
          logger.warn(`${LOGGER_TEXT.INDENT}review error: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
          const _existing = cache.read(entry.filePath!);
          await cache.write(entry.filePath!, {
            ..._existing,
            status: CACHE_STATUSES.REVIEW_FAILED,
          });
        }
      }
    },
    concurrency,
  );
};
