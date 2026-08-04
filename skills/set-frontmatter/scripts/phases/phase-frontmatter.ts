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
import { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { LOGGER_TEXT } from '../../../_cle-libs/constants/logger.constants.ts';
import { isRateLimitError } from '../../../_cle-libs/libs/ai/rate-limit-utils.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// ─── Local
import { generateFrontmatter } from '../modules/setfm-frontmatter.ts';
import { applyCacheToEntry, extractEntryFrontmatter } from '../modules/setfm-write.ts';
import type { SetfmConfig } from '../types/args.types.ts';
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─── Internal types
type _GenerateProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
  model?: string,
  signal?: AbortSignal,
) => Promise<boolean>;

/**
 * キャッシュがフロントマター生成済みかを判定する。
 *
 * `status` が `TYPE_CATEGORY` または `FRONTMATTER` で、かつ `frontmatter` が保存されているとき `true`。
 *
 * @param cache - 判定対象のキャッシュエントリ
 * @returns 生成済みなら `true`
 */
const _isGenerated = (cache: SetfmCache): boolean => {
  return (cache.status === SETFM_CACHE_STATUSES.TYPE_CATEGORY || cache.status === SETFM_CACHE_STATUSES.FRONTMATTER)
    && !!cache.frontmatter;
};

/**
 * 再実行時にフロントマターを AI 生成する必要があるかを entry と cache から純粋判定する。
 *
 * キャッシュが生成済み（`_isGenerated`）、または entry に必須フィールドが既記入なら AI 不要（`false`）。
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @returns AI 生成が必要なら `true`
 */
export const needsFrontmatterAi = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): boolean => {
  return !_isGenerated(cache.read(entry.filePath!)) && !entry.frontmatter.hasRequiredFields();
};

export const phaseFrontmatter = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  config: Pick<SetfmConfig, 'concurrency' | 'dryRun' | 'model'> & Partial<Pick<SetfmConfig, 'maxRetry'>>,
  generateProvider?: _GenerateProvider,
): Promise<void> => {
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
    if (e.frontmatter.hasRequiredFields() && !config.dryRun) {
      await cache.write(e.filePath!, { ..._cached, status: SETFM_CACHE_STATUSES.FRONTMATTER });
    }
    if (config.dryRun) {
      logger.dryrun(`${LOGGER_TEXT.INDENT}frontmatter (cached): ${getFilename(e.filePath!)}`);
    } else {
      logger.info(`${LOGGER_TEXT.INDENT}generated (cached): ${getFilename(e.filePath!)}`);
    }
  }

  const _alreadyFilled = _misses.filter((e) => e.frontmatter.hasRequiredFields());
  const _needsGenerate = _misses.filter((e) => !e.frontmatter.hasRequiredFields());

  await runConcurrent(
    _alreadyFilled,
    async (entry) => {
      const _fmSnapshot = extractEntryFrontmatter(entry);
      const _existing = cache.read(entry.filePath!);
      if (!config.dryRun) {
        await cache.write(entry.filePath!, {
          ..._existing,
          frontmatter: _fmSnapshot,
          status: SETFM_CACHE_STATUSES.FRONTMATTER,
        });
      }
      if (config.dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}frontmatter (existing): ${getFilename(entry.filePath!)}`);
      } else {
        logger.info(`${LOGGER_TEXT.INDENT}frontmatter (existing): ${getFilename(entry.filePath!)}`);
      }
    },
    config.concurrency,
  );

  const _generate = generateProvider ?? generateFrontmatter;
  await runConcurrent(
    _needsGenerate,
    async (entry, ctl) => {
      if (config.dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}frontmatter: ${getFilename(entry.filePath!)}`);
      } else {
        let _ok: boolean;
        try {
          _ok = await _generate(entry, maxContentLength, dics, prompts, config.maxRetry ?? 0, config.model, ctl.signal);
        } catch (e) {
          if (isRateLimitError(e) || ctl.signal.aborted) {
            throw e;
          }
          logger.error(`${LOGGER_TEXT.INDENT}FAIL (生成失敗): ${getFilename(entry.filePath!)} — ${e}`);
          return;
        }
        if (_ok) {
          const _fmSnapshot = extractEntryFrontmatter(entry);
          const _existing = cache.read(entry.filePath!);
          const _statusUpdate = entry.frontmatter.hasRequiredFields()
            ? { status: SETFM_CACHE_STATUSES.FRONTMATTER }
            : {};
          await cache.write(entry.filePath!, { ..._existing, frontmatter: _fmSnapshot, ..._statusUpdate });
          logger.info(`${LOGGER_TEXT.INDENT}generated: ${getFilename(entry.filePath!)}`);
        } else {
          logger.warn(`${LOGGER_TEXT.INDENT}FAIL (生成失敗): ${getFilename(entry.filePath!)}`);
        }
      }
    },
    config.concurrency,
  );
};
