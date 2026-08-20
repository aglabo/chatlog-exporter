// src: skills/normalize-chatlogs/scripts/phases/phase-segment.ts
// @(#): AI セグメント分割計画フェーズ
//       対象: phaseSegment
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// classes
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
// types
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Local
import { hasSegments, toCacheKey } from '../libs/cache-utils.ts';
import { segmentChatlogs } from '../modules/segment-ai.ts';
// constants
import { BATCH_SIZE } from '../constants/normalize.constants.ts';
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';
// libs
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

/**
 * Runs `segmentChatlogs` for a single `chunk` and persists newly-decided segment
 * boundaries to the cache.
 *
 * On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written to the cache
 * with `status: 'set'`, so a subsequent run does not re-invoke the AI. When the AI returned
 * no entry for a file, returned an empty segment array, or returned a segment missing
 * `startLine`/`endLine`, `status: 'retry'` is written instead (no `segments`) so the file is
 * re-decided on the next run, and the entry is excluded from the result. The failure cause is
 * not distinguished. Only called for non-`dryRun` runs — see `phaseSegment`.
 *
 * @param chunk  - Entries to segment together in a single AI call
 * @param config - Model/timeout options forwarded to `segmentChatlogs`
 * @param cache  - Cache written with decided segment boundaries
 * @param signal - Abort signal forwarded to `segmentChatlogs`, aborted when a sibling chunk fails
 * @returns Entries from `chunk` whose segment boundaries were successfully written to the cache
 */
const _processChunk = async (
  chunk: ChatlogEntry[],
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs'>,
  cache: ChatlogCache<NormalizeCache>,
  signal: AbortSignal,
): Promise<ChatlogEntry[]> => {
  const _aiResultMap = await segmentChatlogs(chunk, {
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    signal,
  });

  const _results = await Promise.all(
    chunk.map(async (entry) => {
      const filePath = entry.filePath!;
      const segments = _aiResultMap.get(filePath);
      if (
        !segments || segments.length === 0
        || segments.some((s) => s.startLine === undefined || s.endLine === undefined)
      ) {
        // Record the file as pending re-decision instead of leaving it silently unaccounted for.
        // An empty `segments` array must NOT be written as `status: 'set'` — that would make
        // `hasSegments` true forever and the file would never be segmented again.
        await cache.write(toCacheKey(filePath), { status: NORMALIZE_CACHE_STATUSES.RETRY });
        return null;
      }
      const _cacheEntry: Partial<NormalizeCache> = {
        status: NORMALIZE_CACHE_STATUSES.SET,
        segments: segments.map((s) => ({
          title: s.title,
          summary: s.summary,
          startLine: s.startLine!,
          endLine: s.endLine!,
        })),
      };
      // write() (overwrite, not merge) is safe here: files reaching phaseSegment have
      // status === undefined or 'retry' (done/set entries are filtered out by _classifyEntries in
      // process-files.ts), and neither carries `segments` worth preserving.
      await cache.write(toCacheKey(filePath), _cacheEntry);
      return entry;
    }),
  );

  return _results.filter((entry): entry is ChatlogEntry => entry !== null);
};

/**
 * Determines segment split plans for `entries`, preferring cached `segments`
 * (resume support) over a fresh AI call, and persists newly-decided segments to the cache.
 *
 * When `config.dryRun` is true, no AI call is made and no cache write happens: only
 * already-cached entries are returned, uncached entries are left unplanned (the caller
 * accounts for them as skipped — see `_accountSegmentFailures` in `process-files.ts`).
 *
 * Entries with cached `segments` are returned as-is (no AI call). The remainder is chunked
 * into groups of at most `BATCH_SIZE` (or 1 when `config.singleFile` is true) and each chunk
 * is processed via {@link _processChunk} with parallelism `concurrency` to bound prompt size
 * and timeout risk. On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written
 * to the cache. Entries whose AI call failed, whose segments came back empty, or whose segments
 * are missing `startLine`/`endLine`, are excluded from the result and written with
 * `status: 'retry'` so the next run re-decides them.
 *
 * Segment boundaries are line numbers within `ChatlogEntry.content` (frontmatter excluded),
 * not the raw file.
 *
 * @param entries     - Files loaded as `ChatlogEntry`
 * @param cache       - Cache read for resume, written with decided segment boundaries
 * @param config      - Model/timeout/singleFile/dryRun options forwarded to `segmentChatlogs` and chunking
 * @param concurrency - Parallelism for processing chunks
 * @returns Entries whose segment boundaries are present in the cache after this call
 */
export const phaseSegment = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<NormalizeCache>,
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs' | 'dryRun' | 'singleFile'>,
  concurrency: number,
): Promise<ChatlogEntry[]> => {
  const _cachedEntries = entries.filter((entry) => hasSegments(entry, cache));
  if (config.dryRun) {
    return _cachedEntries;
  }
  const _uncachedEntries = entries.filter((entry) => !hasSegments(entry, cache));

  const _chunkSize = config.singleFile ? 1 : BATCH_SIZE;
  const _chunks = Array.from(
    { length: Math.ceil(_uncachedEntries.length / _chunkSize) },
    (_, i) => _uncachedEntries.slice(i * _chunkSize, (i + 1) * _chunkSize),
  );

  const _processedChunks = await runConcurrent(
    _chunks,
    (chunk, ctl) => _processChunk(chunk, config, cache, ctl.signal),
    concurrency,
  );

  return [..._cachedEntries, ..._processedChunks.flat()];
};
