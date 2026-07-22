// src: skills/normalize-chatlogs/scripts/phases/phase-write.ts
// @(#): セグメント書き込みフェーズ
//       対象: phaseWrite, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// functions
import { extractChatlogPath } from '../../../_scripts/libs/file-io/resolve-directory.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// classes
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';

// ─── Local
import { extractLines } from '../modules/segment-ai.ts';
import { toCacheKey, writeSegmentToFile } from '../modules/segment-io.ts';
// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig, Segment, Stats } from '../types/normalize.types.ts';

/**
 * Resolves the output directory for a single chatlog file.
 *
 * If `filePath` contains `chatlogs/<agent>/<yyyy>/<yyyy-mm>`, returns
 * `<outputBase>/<agent>/<yyyy>/<yyyy-mm>/<project>`.
 * Otherwise returns `<outputBase>/<project>`.
 * Falls back to `'misc'` when `project` is undefined.
 */
export const resolveOutputDir = (outputBase: string, filePath: string, project?: string): string => {
  const chatlogPath = extractChatlogPath(filePath);
  const effectiveProject = project ?? 'misc';
  return chatlogPath
    ? `${outputBase}/${chatlogPath}/${effectiveProject}`
    : `${outputBase}/${effectiveProject}`;
};

/**
 * Whether the cache holds decided segment boundaries (`segments`) for `entry` —
 * i.e. AI planning succeeded (status `'set'` or `'done'` from this or a prior run).
 *
 * @param entry - Entry whose cache entry is checked
 * @param cache - Cache read for `segments`
 */
const _hasSegments = (entry: ChatlogEntry, cache: ChatlogCache<NormalizeCache>): boolean =>
  cache.read(toCacheKey(entry.filePath!)).segments !== undefined;

/**
 * Rebuilds a `Segment[]` for `entry` from its cached segment boundaries.
 *
 * `summary` is read as-is from the cache; `content` is re-sliced from the current
 * `entry.content` via {@link extractLines}. Must only be called for entries where
 * {@link _hasSegments} is true.
 *
 * @param entry - Entry whose cached segment boundaries are rebuilt into full `Segment[]`
 * @param cache - Cache read for `segments` (`{title, summary, startLine, endLine}[]`)
 */
export const _rebuildSegments = (
  entry: ChatlogEntry,
  cache: ChatlogCache<NormalizeCache>,
): Segment[] => {
  const _cachedSegments = cache.read(toCacheKey(entry.filePath!)).segments!;
  const _lines = entry.content.split('\n');
  return _cachedSegments.map((s) => ({
    title: s.title,
    summary: s.summary,
    content: extractLines(_lines, s.startLine, s.endLine),
    startLine: s.startLine,
    endLine: s.endLine,
  }));
};

/**
 * Writes the already-planned segments for `entry` to output files and marks the file
 * `status: 'done'` in the cache once written (skipped when `dryRun`).
 *
 * @param entry       - Entry whose cached segment boundaries are rebuilt and written
 * @param outputBase  - Base output directory
 * @param config      - Processing config (dryRun)
 * @param stats       - Mutable counters updated in place
 * @param cache       - Cache read for planned segments, marked `status: 'done'` on successful, non-dryRun writes
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 */
const _writePlannedEntry = async (
  entry: ChatlogEntry,
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun'>,
  stats: Stats,
  cache: ChatlogCache<NormalizeCache>,
  hashFn?: HashProvider,
): Promise<void> => {
  const filePath = entry.filePath!;
  const _projectVal = entry.frontmatter.get('project');
  const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
  const outputDir = resolveOutputDir(outputBase, filePath, _project);
  await Deno.mkdir(outputDir, { recursive: true });

  const segments = _rebuildSegments(entry, cache);
  await Promise.all(
    segments.map((segment, i) =>
      writeSegmentToFile(outputDir, filePath, i, segment, entry.frontmatter, config.dryRun, stats, hashFn)
    ),
  );

  if (!config.dryRun) {
    await cache.update(toCacheKey(filePath), { status: NORMALIZE_CACHE_STATUSES.DONE });
  }
};

/**
 * Applies the fail/fail-fast accounting for an entry whose segment planning did not succeed
 * (no cache hit — AI returned no segments, or a segment missing `startLine`/`endLine`).
 *
 * @param entry  - Entry whose planning failed (no `segments` in the cache)
 * @param config - Processing config (failFast)
 * @param stats  - Mutable counters updated in place
 */
const _writeFailedEntry = (
  entry: ChatlogEntry,
  config: Pick<NormalizeConfig, 'failFast'>,
  stats: Stats,
): Promise<void> => {
  const filePath = entry.filePath!;
  logger.warn(`${LOGGER_TEXT.INDENT}failed (no segments returned): ${getBasename(filePath)}`);
  stats.fail++;
  if (config.failFast) {
    throw new ChatlogError('FailFast', 'SegmentFailed', `fail-fast triggered by: ${getBasename(filePath)}`);
  }
  return Promise.resolve();
};

/**
 * Writes planned segments to output files, applying `failFast` behavior, and marks the file
 * `status: 'done'` in the cache once written (skipped when `dryRun`).
 *
 * `entries` is partitioned up front by cache hit/miss (see {@link _hasSegments}) into planned
 * entries (segments rebuilt from the cache and written normally) and failed entries
 * (fail/failFast/warn accounting), so `entries` must be the full entry list (not filtered to
 * AI-planning successes) for cache-miss entries to reach the fail handling.
 *
 * @param entries     - Files loaded as `ChatlogEntry`
 * @param outputBase  - Base output directory
 * @param config      - Processing config (dryRun, failFast)
 * @param stats       - Mutable counters updated in place
 * @param cache       - Cache read for planned segments, marked `status: 'done'` on successful, non-dryRun writes
 * @param concurrency - Parallelism for writing segments across `entries`
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 */
export const phaseWrite = async (
  entries: ChatlogEntry[],
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun' | 'failFast'>,
  stats: Stats,
  cache: ChatlogCache<NormalizeCache>,
  concurrency: number,
  hashFn?: HashProvider,
): Promise<void> => {
  const _plannedEntries = entries.filter((entry) => _hasSegments(entry, cache));
  const _failedEntries = entries.filter((entry) => !_hasSegments(entry, cache));

  await runConcurrent(
    _plannedEntries,
    (entry) => _writePlannedEntry(entry, outputBase, config, stats, cache, hashFn),
    concurrency,
  );
  await runConcurrent(
    _failedEntries,
    (entry) => _writeFailedEntry(entry, config, stats),
    concurrency,
  );
};
