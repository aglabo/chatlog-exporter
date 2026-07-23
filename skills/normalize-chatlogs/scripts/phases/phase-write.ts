// src: skills/normalize-chatlogs/scripts/phases/phase-write.ts
// @(#): セグメント書き込みフェーズ
//       対象: phaseWrite, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// functions
import { isFileIoError } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
// classes
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';

// ─── Local
import { toCacheKey } from '../libs/cache-utils.ts';
import { extractLines } from '../modules/segment-ai.ts';
import { writeSegmentToFile } from '../modules/segment-io.ts';
// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig, Segment, Stats } from '../types/normalize.types.ts';

/**
 * Resolves the output directory for a single chatlog file.
 *
 * Joins `project` onto `outputBase`. Falls back to `'misc'` when `project` is undefined.
 */
export const resolveOutputDir = (outputBase: string, project?: string): string => {
  return `${outputBase}/${project ?? 'misc'}`;
};

/**
 * Rebuilds a `Segment[]` for `entry` from its cached segment boundaries.
 *
 * `summary` is read as-is from the cache; `content` is re-sliced from the current
 * `entry.content` via {@link extractLines}. Must only be called for entries whose
 * cache entry already has `segments` (planned via `phaseSegment`).
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
 * Writes a single segment via {@link writeSegmentToFile}, classifying failures.
 *
 * File I/O errors (permission denied, disk full, etc. — see {@link isFileIoError}) are caught,
 * logged, and reported as a failure (`success: false`) without throwing, so one bad segment
 * does not abort the rest. Any other error (e.g. `ChatlogError('ForbiddenOutput', ...)`, a
 * programming-level violation) is rethrown.
 *
 * @param outputDir   - Directory in which the output file is written
 * @param filePath    - Source chatlog file path
 * @param index       - Zero-based segment index
 * @param segment     - Segment data (title, summary, content)
 * @param frontmatter - ChatlogFrontmatter instance from the source file
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 * @returns Whether the write succeeded
 */
export const _writeSegment = async (
  outputDir: string,
  filePath: string,
  index: number,
  segment: Segment,
  frontmatter: ChatlogEntry['frontmatter'],
  hashFn?: HashProvider,
): Promise<{ success: boolean }> => {
  try {
    await writeSegmentToFile(outputDir, filePath, index, segment, frontmatter, hashFn);
    logger.info(`${LOGGER_TEXT.INDENT}written: ${getBasename(filePath)}`);
    return { success: true };
  } catch (e) {
    if (!isFileIoError(e)) {
      throw e;
    }
    logger.warn(`${LOGGER_TEXT.INDENT}failed (write error: ${(e as Error).message}): ${getBasename(filePath)}`);
    return { success: false };
  }
};

/**
 * Writes the already-planned segments for `entry` to output files and marks the file
 * `status: 'done'` in the cache once all segments are written successfully.
 *
 * When `config.dryRun` is true, no disk writes happen and the cache is not updated: each
 * segment logs a dry-run message via `logger.dryrun` and increments `stats.skip` instead of
 * calling {@link writeSegmentToFile}.
 *
 * When not `dryRun`, each segment is written via {@link _writeSegment}: successes increment
 * `stats.success`, file I/O failures increment `stats.fail` (see {@link isFileIoError}) without
 * aborting the other segments. The cache is only marked `status: 'done'` when every segment for
 * `entry` succeeded.
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
  const segments = _rebuildSegments(entry, cache);

  if (config.dryRun) {
    segments.forEach(() => {
      logger.dryrun(`skipped written: ${getBasename(filePath)}`);
    });
    stats.skip += segments.length;
    return;
  }

  const _projectVal = entry.frontmatter.get('project');
  const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
  const outputDir = resolveOutputDir(outputBase, _project);
  await Deno.mkdir(outputDir, { recursive: true });

  const _results = await Promise.all(
    segments.map((segment, i) => _writeSegment(outputDir, filePath, i, segment, entry.frontmatter, hashFn)),
  );
  const _successCount = _results.filter((r) => r.success).length;
  stats.success += _successCount;
  stats.fail += _results.length - _successCount;

  if (_successCount === segments.length) {
    await cache.update(toCacheKey(filePath), { status: NORMALIZE_CACHE_STATUSES.DONE });
  }
};

/**
 * Writes planned segments to output files and marks the file `status: 'done'` in the cache
 * once written (skipped when `dryRun`).
 *
 * The caller must pass only entries whose segment boundaries are already planned
 * (`hasSegments` from `cache-utils.ts` is true). Entries whose planning did not succeed
 * (AI failure) are handled by the caller before reaching this function.
 *
 * @param entries     - Files loaded as `ChatlogEntry`, all with planned segments in the cache
 * @param outputBase  - Base output directory
 * @param config      - Processing config (dryRun)
 * @param stats       - Mutable counters updated in place
 * @param cache       - Cache read for planned segments, marked `status: 'done'` on successful, non-dryRun writes
 * @param concurrency - Parallelism for writing segments across `entries`
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 */
export const phaseWrite = async (
  entries: ChatlogEntry[],
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun'>,
  stats: Stats,
  cache: ChatlogCache<NormalizeCache>,
  concurrency: number,
  hashFn?: HashProvider,
): Promise<void> => {
  await runConcurrent(
    entries,
    (entry) => _writePlannedEntry(entry, outputBase, config, stats, cache, hashFn),
    concurrency,
  );
};
