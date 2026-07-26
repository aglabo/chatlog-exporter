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
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { CACHE_STATUSES } from '../../../_scripts/types/cache-status.const.types.ts';
// ─── Local
import { judgeTypeAndCategory } from '../modules/setfm-type-category.ts';
import type { SetfmConfig } from '../types/args.types.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─── Internal types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  model?: string,
  signal?: AbortSignal,
) => Promise<void>;

/**
 * 再実行時に type/category を AI 判定する必要があるかを entry と cache から純粋判定する。
 *
 * 次のいずれかを満たすとき `true`（AI 判定が必要）を返す。
 * - キャッシュミス（`status === undefined`）
 * - `status` が `EMPTY` または `REVIEW_FAILED`
 * - キャッシュに type または category が欠けている
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @returns AI 判定が必要なら `true`
 */
export const needsTypeCategoryAi = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): boolean => {
  const _cached = cache.read(entry.filePath!);
  return (
    _cached.status === undefined
    || _cached.status === CACHE_STATUSES.EMPTY
    || _cached.status === CACHE_STATUSES.REVIEW_FAILED
    || !(_cached.type && _cached.category)
  );
};

export const phaseTypeAndCategory = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  config: Pick<SetfmConfig, 'concurrency' | 'dryRun' | 'model'>,
  judgeProvider?: _JudgeProvider,
): Promise<void> => {
  const _needsReJudge = (e: ChatlogEntry): boolean => needsTypeCategoryAi(e, cache);
  const _hits = entries.filter((e) => !_needsReJudge(e));
  const _misses = entries.filter(_needsReJudge);

  _hits.forEach((e) => {
    const _cached = cache.read(e.filePath!);
    e.frontmatter.set('type', _cached.type!);
    e.frontmatter.set('category', _cached.category!);
    logger.info(`${LOGGER_TEXT.INDENT}type+category (cached): ${getFilename(e.filePath!)}`);
  });

  const _judge = judgeProvider ?? judgeTypeAndCategory;
  await runConcurrent(
    _misses,
    async (entry, ctl) => {
      if (config.dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}type/category: ${getFilename(entry.filePath!)}`);
      } else {
        const _cachedStatus = cache.read(entry.filePath!).status;
        const _existingType = entry.frontmatter.get('type') as string | undefined;
        const _existingCategory = entry.frontmatter.get('category') as string | undefined;
        if (_cachedStatus !== CACHE_STATUSES.REVIEW_FAILED && _existingType && _existingCategory) {
          await cache.write(entry.filePath!, {
            type: _existingType,
            category: _existingCategory,
            status: CACHE_STATUSES.SET_TYPES,
          });
          logger.info(`${LOGGER_TEXT.INDENT}type+category (existing): ${getFilename(entry.filePath!)}`);
          return;
        }
        await _judge(entry, maxContentLength, dics, prompts, config.model, ctl.signal);
        const _type = entry.frontmatter.get('type') as string;
        const _category = entry.frontmatter.get('category') as string;
        if (_type && _category) {
          await cache.write(entry.filePath!, { type: _type, category: _category, status: CACHE_STATUSES.SET_TYPES });
        } else {
          await cache.delete(entry.filePath!);
        }
        logger.info(
          `${LOGGER_TEXT.INDENT}type [${entry.frontmatter.get('type')}] category [${
            entry.frontmatter.get('category')
          }]: ${getFilename(entry.filePath!)}`,
        );
      }
    },
    config.concurrency,
  );
};
