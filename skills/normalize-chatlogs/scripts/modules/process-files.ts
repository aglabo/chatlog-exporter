// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜phaseWrite ブロックの processFiles 関数モジュール
//       対象: processFiles, _validateDirs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// constants
import { LOGGER_TEXT } from '../../../_cle-libs/constants/logger.constants.ts';
// functions
import { dirExists } from '../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../../_cle-libs/libs/file-ops/find-files.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { getBasename, normalizePath } from '../../../_cle-libs/libs/path-utils/path-utils.ts';

// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';

// types
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import type { HashProvider } from '../../../_cle-libs/types/providers.types.ts';
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';

// --- internal modules
import { hasSegments, toCacheKey } from '../libs/cache-utils.ts';
import { phaseLoad } from '../phases/phase-load.ts';
import { phaseSegment } from '../phases/phase-segment.ts';
import { phaseWrite } from '../phases/phase-write.ts';

/**
 * Validates inputDir/outputBase (existence, creation, containment).
 * Runs before cache initialization since it has no dependency on the cache.
 *
 * @param inputDir   - Source directory (already normalized)
 * @param outputBase - Base output directory (already normalized)
 */
const _validateDirs = async (inputDir: string, outputBase: string): Promise<void> => {
  // inputDir 存在確認
  if (!await dirExists(inputDir)) {
    throw new ChatlogError('InputNotFound', 'InputDir', `inputDir not found or not a directory: ${inputDir}`);
  }

  // outputBase 作成・存在確認
  await Deno.mkdir(outputBase, { recursive: true });
  if (!await dirExists(outputBase)) {
    throw new ChatlogError('FileDirNotFound', 'OutputBase', `outputBase could not be created: ${outputBase}`);
  }

  // containment チェック（outputBase が inputDir 配下でないこと）
  if (outputBase.startsWith(inputDir + '/') || outputBase === inputDir) {
    throw new ChatlogError(
      'ForbiddenOutput',
      'OutputInsideInput',
      `outputBase must not be inside inputDir: ${outputBase}`,
    );
  }
};

/** Result of partitioning loaded `ChatlogEntry` objects by cache status. */
type _ClassifiedEntries = {
  doneEntries: ChatlogEntry[];
  setEntries: ChatlogEntry[];
  unclassifiedEntries: ChatlogEntry[];
};

/**
 * Partitions loaded `entries` by cache status: already-normalized (done), already
 * segment-planned (set), and unclassified (needs AI segmentation).
 *
 * @param entries - Entries loaded via {@link phaseLoad}
 * @param cache   - Cache used to detect already-normalized/planned files across runs
 * @returns The three cache-status groups
 */
const _classifyEntries = (entries: ChatlogEntry[], cache: ChatlogCache<NormalizeCache>): _ClassifiedEntries => {
  const _statusOf = (entry: ChatlogEntry) => cache.read(toCacheKey(entry.filePath!)).status;

  const doneEntries = entries.filter((entry) => _statusOf(entry) === NORMALIZE_CACHE_STATUSES.DONE);
  const setEntries = entries.filter((entry) => _statusOf(entry) === NORMALIZE_CACHE_STATUSES.SET);
  const unclassifiedEntries = entries.filter((entry) => _statusOf(entry) === undefined);

  return { doneEntries, setEntries, unclassifiedEntries };
};

/**
 * Applies the fail/fail-fast accounting for entries whose segment planning did not succeed
 * (AI returned no segments, or a segment missing `startLine`/`endLine`).
 *
 * When `config.dryRun` is true, no `ChatlogError` is thrown (regardless of `failFast`); each
 * failed entry logs a dry-run message via `logger.dryrun` and increments `stats.skip` instead
 * of `stats.fail`.
 *
 * @param entries - Entries to check (only those still missing planned segments are accounted)
 * @param cache   - Cache read to detect planning success (`hasSegments`)
 * @param config  - Processing config (failFast, dryRun)
 * @param stats   - Mutable counters updated in place
 */
const _accountSegmentFailures = (
  entries: ChatlogEntry[],
  cache: ChatlogCache<NormalizeCache>,
  config: Pick<NormalizeConfig, 'failFast' | 'dryRun'>,
  stats: Stats,
): void => {
  const failedEntries = entries.filter((entry) => !hasSegments(entry, cache));

  if (!config.dryRun && config.failFast && failedEntries.length > 0) {
    throw new ChatlogError(
      'FailFast',
      'SegmentFailed',
      `fail-fast triggered by: ${getBasename(failedEntries[0].filePath!)}`,
    );
  }

  if (config.dryRun) {
    failedEntries.forEach((entry) => {
      logger.dryrun(`skipped (no segments returned): ${getBasename(entry.filePath!)}`);
    });
    stats.skip += failedEntries.length;
    return;
  }

  failedEntries.forEach((entry) => {
    logger.warn(`${LOGGER_TEXT.INDENT}failed (no segments returned): ${getBasename(entry.filePath!)}`);
  });
  stats.fail += failedEntries.length;
};

/**
 * Processes markdown files under `inputDir` by segmenting each via AI and writing output.
 *
 * Flow: {@link _validateDirs} (validate, before cache init) → `findFiles` (discover) →
 * {@link phaseLoad} (load all files into `ChatlogEntry`, partition load errors) →
 * {@link _classifyEntries} (classify loaded entries by cache status: done/set/unclassified) →
 * {@link phaseSegment} (AI call for unclassified entries; writes planned segments to the cache;
 * skips the AI call entirely when `dryRun`, returning only already-planned entries)
 * → {@link _accountSegmentFailures} (fail/failFast/warn accounting for entries still without
 * planned segments after phaseSegment; dryRun accounts as skip instead and never throws)
 * → {@link phaseWrite} (rebuild segments from cache, write output, update cache) for the union
 * of already-`set` entries and newly-planned entries.
 * Updates `stats` in place: `done` increments on already-normalized skip, `error` on load error,
 * `fail` on AI error (or `skip` when dryRun), `success` on each write.
 *
 * @param inputDir   - Source directory (files are discovered here via findFiles)
 * @param outputBase - Base output directory
 * @param config     - Processing config (dryRun, concurrency)
 * @param stats      - Mutable counters updated in place
 * @param hashFn     - Optional hash generator for output file names (injectable for testing)
 */
export const processFiles = async (
  inputDir: string,
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model' | 'timeoutMs' | 'failFast' | 'singleFile'>,
  stats: Stats,
  hashFn?: HashProvider,
): Promise<void> => {
  const _inputDir = normalizePath(inputDir);
  const _outputBase = normalizePath(outputBase);

  await _validateDirs(_inputDir, _outputBase);
  const allFiles = await findFiles(_inputDir);

  const cache = new ChatlogCache<NormalizeCache>('normalize-cache');
  await cache.ready;

  const { entries: allEntries, errors: _errors } = await phaseLoad(
    allFiles,
    config,
    config.concurrency,
  );
  stats.error += _errors.length;
  if (_errors.length > 0) {
    logger.error(`${LOGGER_TEXT.INDENT}can't read files: ${_errors.length}`);
  }

  const { doneEntries, setEntries, unclassifiedEntries } = _classifyEntries(allEntries, cache);

  for (const entry of doneEntries) {
    logger.info(`${LOGGER_TEXT.INDENT}skipped (already normalized): ${getBasename(entry.filePath!)}`);
  }
  stats.done += doneEntries.length;

  const _plannedEntries = await phaseSegment(unclassifiedEntries, cache, config, config.concurrency);
  _accountSegmentFailures(unclassifiedEntries, cache, config, stats);

  await phaseWrite([...setEntries, ..._plannedEntries], _outputBase, config, stats, cache, config.concurrency, hashFn);
};
