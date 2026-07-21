// src: skills/normalize-chatlogs/scripts/phases/phase-plan.ts
// @(#): AI セグメント分割計画フェーズ
//       対象: phasePlan
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
import { extractLines, segmentChatlogs } from '../modules/segment-ai.ts';
import { extractSegmentBaseName } from '../modules/segment-io.ts';
// constants
import { BATCH_SIZE } from '../constants/normalize.constants.ts';
// types
import type { NormalizeCache } from '../types/cache.types.ts';
import type { NormalizeConfig, Segment } from '../types/normalize.types.ts';

/** Derives a cache key from a source chatlog file path (same normalization as {@link extractSegmentBaseName}). */
const _toCacheKey = (filePath: string): string => extractSegmentBaseName(filePath);

/**
 * Determines segment split plans for `entries`, preferring cached `segments`
 * (resume support) over a fresh AI call, and persists newly-decided segments to the cache.
 *
 * For entries with cached `segments`, ranges are re-sliced from the current entry content via
 * {@link extractLines} (no AI call). The remainder is chunked into groups of at most
 * `BATCH_SIZE` (or 1 when `config.singleFile` is true) and each chunk is sent to
 * `segmentChatlogs` in turn to bound prompt size and timeout risk; results are merged
 * into the same result map. On success, segment boundaries (`title`/`startLine`/`endLine`)
 * are written to the cache — even when `dryRun` is true, so a subsequent run does not
 * re-invoke the AI. The cache write in `dryRun` omits `status: 'done'` so the file is
 * still writable in the following run.
 *
 * Segment boundaries are line numbers within `ChatlogEntry.content` (frontmatter excluded),
 * not the raw file.
 *
 * @param entries - Files loaded as `ChatlogEntry`
 * @param config  - Model/timeout/singleFile options forwarded to `segmentChatlogs` and chunking
 * @param cache   - Cache read for resume, written with decided segment boundaries
 * @returns Map from filePath to its planned `Segment[]`, or `null` when planning failed
 */
export const phasePlan = async (
  entries: ChatlogEntry[],
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs' | 'dryRun' | 'singleFile'>,
  cache: ChatlogCache<NormalizeCache>,
): Promise<Map<string, Segment[] | null>> => {
  const _cachedEntries = entries.filter((e) => cache.read(_toCacheKey(e.filePath!)).segments !== undefined);
  const _uncachedEntries = entries.filter((e) => cache.read(_toCacheKey(e.filePath!)).segments === undefined);

  const _resultMap = new Map<string, Segment[] | null>(
    _cachedEntries.map((entry) => {
      const _lines = entry.content.split('\n');
      const _cachedSegments = cache.read(_toCacheKey(entry.filePath!)).segments!;
      return [
        entry.filePath!,
        _cachedSegments.map((s) => ({
          title: s.title,
          summary: '',
          content: extractLines(_lines, s.startLine, s.endLine),
          startLine: s.startLine,
          endLine: s.endLine,
        })),
      ];
    }),
  );

  if (_uncachedEntries.length === 0) {
    return _resultMap;
  }

  const _chunkSize = config.singleFile ? 1 : BATCH_SIZE;
  const _chunks = Array.from(
    { length: Math.ceil(_uncachedEntries.length / _chunkSize) },
    (_, i) => _uncachedEntries.slice(i * _chunkSize, (i + 1) * _chunkSize),
  );

  for (const chunk of _chunks) {
    const _aiResultMap = await segmentChatlogs(chunk, {
      model: config.model,
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    });

    await Promise.all(
      chunk.map(async (entry) => {
        const filePath = entry.filePath!;
        const segments = _aiResultMap.get(filePath);
        _resultMap.set(filePath, segments ?? null);
        if (!segments || segments.some((s) => s.startLine === undefined || s.endLine === undefined)) {
          return;
        }
        const _cacheEntry: Partial<NormalizeCache> = {
          segments: segments.map((s) => ({ title: s.title, startLine: s.startLine!, endLine: s.endLine! })),
        };
        // write() (overwrite, not merge) is safe here: files reaching phasePlan always have
        // status === undefined (status:'done' files are filtered into skipFiles by _prepareFiles).
        await cache.write(_toCacheKey(filePath), _cacheEntry);
      }),
    );
  }

  return _resultMap;
};
