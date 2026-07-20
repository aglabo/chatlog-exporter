// src: scripts/phases/phase-frontmatter.ts
// @(#): フロントマター生成フェーズ（Phase 2.2）
//       対象: phaseFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { CACHE_STATUSES } from '../../../_scripts/types/cache-status.const.types.ts';
// ─── Local
import { generateFrontmatter } from '../modules/setfm-frontmatter.ts';
import { applyCacheToEntry, extractEntryFrontmatter } from '../modules/setfm-write.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─── Internal types
type _GenerateProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
) => Promise<boolean>;

export const phaseFrontmatter = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  generateProvider?: _GenerateProvider,
  maxRetry = 0,
): Promise<void> => {
  const _isGenerated = (cache: SetfmCache): boolean => {
    return cache.status === CACHE_STATUSES.SET_TYPES && !!cache.frontmatter;
  };

  const _hits = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return _isGenerated(_cached);
  });
  const _misses = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return !_isGenerated(_cached);
  });

  for (const e of _hits) {
    const _cached = cache.read(e.filePath!);
    applyCacheToEntry(e, _cached);
    if (e.frontmatter.hasRequiredFields() && !dryRun) {
      await cache.write(e.filePath!, { ..._cached, status: CACHE_STATUSES.NEED_REVIEW });
    }
    if (dryRun) {
      logger.info(`  [dry-run] frontmatter (cached): ${getFilename(e.filePath!)}`);
    } else {
      logger.info(`  generated (cached): ${getFilename(e.filePath!)}`);
    }
  }

  const _alreadyFilled = _misses.filter((e) => e.frontmatter.hasRequiredFields());
  const _needsGenerate = _misses.filter((e) => !e.frontmatter.hasRequiredFields());

  await runConcurrent(
    _alreadyFilled,
    async (entry) => {
      const _fmSnapshot = extractEntryFrontmatter(entry);
      const _existing = cache.read(entry.filePath!);
      if (!dryRun) {
        await cache.write(entry.filePath!, {
          ..._existing,
          frontmatter: _fmSnapshot,
          status: CACHE_STATUSES.NEED_REVIEW,
        });
      }
      if (dryRun) {
        logger.info(`  [dry-run] frontmatter (existing): ${getFilename(entry.filePath!)}`);
      } else {
        logger.info(`  frontmatter (existing): ${getFilename(entry.filePath!)}`);
      }
    },
    concurrency,
  );

  const _generate = generateProvider ?? generateFrontmatter;
  await runConcurrent(
    _needsGenerate,
    async (entry) => {
      if (dryRun) {
        logger.info(`  [dry-run] frontmatter: ${getFilename(entry.filePath!)}`);
      } else {
        let _ok: boolean;
        try {
          _ok = await _generate(entry, maxContentLength, dics, prompts, maxRetry);
        } catch (e) {
          logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)} — ${e}`);
          return;
        }
        if (_ok) {
          const _fmSnapshot = extractEntryFrontmatter(entry);
          const _existing = cache.read(entry.filePath!);
          const _statusUpdate = entry.frontmatter.hasRequiredFields() ? { status: CACHE_STATUSES.NEED_REVIEW } : {};
          await cache.write(entry.filePath!, { ..._existing, frontmatter: _fmSnapshot, ..._statusUpdate });
          logger.info(`  generated: ${getFilename(entry.filePath!)}`);
        } else {
          logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)}`);
        }
      }
    },
    concurrency,
  );
};
