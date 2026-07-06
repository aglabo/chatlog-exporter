// src: scripts/phases/phase-type-category.ts
// @(#): type・category 同時判定フェーズ（Phase 2.1）
//       対象: phaseTypeAndCategory
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../../_scripts/classes/ChatlogWorks.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { CACHE_STATUSES } from '../../../_scripts/types/cache-status.const.types.ts';
// ─── Local
import { judgeTypeAndCategory } from '../modules/setfm-type-category.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─── Internal types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
) => Promise<void>;

export const phaseTypeAndCategory = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  judgeProvider?: _JudgeProvider,
): Promise<void> => {
  const _needsReJudge = (e: ChatlogEntry): boolean => {
    const _cached = cache.read(e.filePath!);
    return (
      _cached.status === undefined
      || _cached.status === CACHE_STATUSES.EMPTY
      || _cached.status === CACHE_STATUSES.REVIEW_FAILED
      || !(_cached.type && _cached.category)
    );
  };
  const _hits = entries.filter((e) => !_needsReJudge(e));
  const _misses = entries.filter(_needsReJudge);

  _hits.forEach((e) => {
    const _cached = cache.read(e.filePath!);
    e.frontmatter.set('type', _cached.type!);
    e.frontmatter.set('category', _cached.category!);
    logger.info(`  type+category (cached): ${getFilename(e.filePath!)}`);
  });

  const _judge = judgeProvider ?? judgeTypeAndCategory;
  await runConcurrent(
    _misses,
    async (entry) => {
      if (dryRun) {
        logger.info(`  [dry-run] type/category: ${getFilename(entry.filePath!)}`);
      } else {
        await _judge(entry, maxContentLength, dics, prompts);
        const _type = entry.frontmatter.get('type') as string;
        const _category = entry.frontmatter.get('category') as string;
        if (_type && _category) {
          await cache.write(entry.filePath!, { type: _type, category: _category, status: CACHE_STATUSES.SET_TYPES });
        } else {
          await cache.delete(entry.filePath!);
        }
        logger.info(
          `  type [${entry.frontmatter.get('type')}] category [${entry.frontmatter.get('category')}]: ${
            getFilename(entry.filePath!)
          }`,
        );
      }
    },
    concurrency,
  );
};
