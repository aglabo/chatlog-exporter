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
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Local
import { segmentChatlogs } from '../modules/segment-ai.ts';
import { toCacheKey } from '../modules/segment-io.ts';
// constants
import { BATCH_SIZE } from '../constants/normalize.constants.ts';
// libs
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
// types
import type { NormalizeCache } from '../types/cache.types.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

/**
 * Runs `segmentChatlogs` for a single `chunk` and persists newly-decided segment
 * boundaries to the cache.
 *
 * On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written to the cache
 * with `status: 'set'` — even when `dryRun` is true, so a subsequent run does not
 * re-invoke the AI. Cache writes are skipped when the AI returned no segments, or when
 * any segment is missing `startLine`/`endLine`.
 *
 * @param chunk  - Entries to segment together in a single AI call
 * @param config - Model/timeout options forwarded to `segmentChatlogs`
 * @param cache  - Cache written with decided segment boundaries
 * @returns Entries from `chunk` whose segment boundaries were successfully written to the cache
 */
const _processChunk = async (
  chunk: ChatlogEntry[],
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs'>,
  cache: ChatlogCache<NormalizeCache>,
): Promise<ChatlogEntry[]> => {
  const _aiResultMap = await segmentChatlogs(chunk, {
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
  });

  const _results = await Promise.all(
    chunk.map(async (entry) => {
      const filePath = entry.filePath!;
      const segments = _aiResultMap.get(filePath);
      if (!segments || segments.some((s) => s.startLine === undefined || s.endLine === undefined)) {
        return null;
      }
      const _cacheEntry: Partial<NormalizeCache> = {
        status: 'set',
        segments: segments.map((s) => ({
          title: s.title,
          summary: s.summary,
          startLine: s.startLine!,
          endLine: s.endLine!,
        })),
      };
      // write() (overwrite, not merge) is safe here: files reaching phaseSegment always have
      // status === undefined (status:'done' files are filtered into skipFiles by _prepareFiles).
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
 * Entries with cached `segments` are returned as-is (no AI call). The remainder is chunked
 * into groups of at most `BATCH_SIZE` (or 1 when `config.singleFile` is true) and each chunk
 * is processed via {@link _processChunk} with parallelism `concurrency` to bound prompt size
 * and timeout risk. On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written
 * to the cache — even when `dryRun` is true, so a subsequent run does not re-invoke the AI.
 * Entries whose AI call failed, or whose segments are missing `startLine`/`endLine`, are
 * excluded from the result and not written to the cache.
 *
 * Segment boundaries are line numbers within `ChatlogEntry.content` (frontmatter excluded),
 * not the raw file.
 *
 * @param entries     - Files loaded as `ChatlogEntry`
 * @param cache       - Cache read for resume, written with decided segment boundaries
 * @param config      - Model/timeout/singleFile options forwarded to `segmentChatlogs` and chunking
 * @param concurrency - Parallelism for processing chunks
 * @returns Entries whose segment boundaries are present in the cache after this call
 */
export const phaseSegment = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<NormalizeCache>,
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs' | 'dryRun' | 'singleFile'>,
  concurrency: number,
): Promise<ChatlogEntry[]> => {
  const _hasCachedSegments = (entry: ChatlogEntry): boolean =>
    cache.read(toCacheKey(entry.filePath!)).segments !== undefined;

  const _cachedEntries = entries.filter(_hasCachedSegments);
  const _uncachedEntries = entries.filter((entry) => !_hasCachedSegments(entry));

  const _chunkSize = config.singleFile ? 1 : BATCH_SIZE;
  const _chunks = Array.from(
    { length: Math.ceil(_uncachedEntries.length / _chunkSize) },
    (_, i) => _uncachedEntries.slice(i * _chunkSize, (i + 1) * _chunkSize),
  );

  const _processedChunks = await runConcurrent(
    _chunks,
    (chunk) => _processChunk(chunk, config, cache),
    concurrency,
  );

  return [..._cachedEntries, ..._processedChunks.flat()];
};
