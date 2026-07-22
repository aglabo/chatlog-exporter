// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜phaseWrite ブロックの processFiles 関数モジュール
//       対象: processFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// functions
import { dirExists } from '../../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getBasename, normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';

// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// --- internal modules
import { toCacheKey } from '../libs/cache-utils.ts';
import { phaseLoad } from '../phases/phase-load.ts';
import { phaseSegment } from '../phases/phase-segment.ts';
import { phaseWrite } from '../phases/phase-write.ts';

/** Result of the "prepare files" phase: files still needing processing, and files already normalized. */
type _PreparedFiles = {
  pendingFiles: string[];
  skipFiles: string[];
};

/**
 * Phase 1: Validates inputDir/outputBase (existence, creation, containment).
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

/**
 * Phase 2: Partitions `mdFiles` into already-normalized (skip) and pending files based on the cache.
 *
 * @param mdFiles - Files discovered via `findFiles(inputDir)`
 * @param cache   - Cache used to detect already-normalized files across runs
 * @returns Pending file paths and the files skipped as already-normalized
 */
const _prepareFiles = (mdFiles: string[], cache: ChatlogCache<NormalizeCache>): _PreparedFiles => {
  // cache に status:'done' が記録済みのファイル（正規化済み）を pending から除外
  const skipFiles = mdFiles.filter((f) => cache.read(toCacheKey(f)).status === NORMALIZE_CACHE_STATUSES.DONE);
  const pendingFiles = mdFiles.filter((f) => cache.read(toCacheKey(f)).status !== NORMALIZE_CACHE_STATUSES.DONE);

  return { pendingFiles, skipFiles };
};

/**
 * Processes markdown files under `inputDir` by segmenting each via AI and writing output.
 *
 * Flow: {@link _validateDirs} (validate, before cache init) → `findFiles` (discover) →
 * {@link _prepareFiles} (skip already-normalized) → {@link phaseLoad} (load, partition
 * load errors) → {@link phaseSegment} (AI call, or cached segments on resume; writes planned
 * segments to the cache) → {@link phaseWrite} (rebuild segments from cache, write output,
 * update cache).
 * Updates `stats` in place: `done` increments on already-normalized skip, `error` on load error,
 * `fail` on AI error, `success` on each write.
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

  const { pendingFiles: _pendingFiles, skipFiles: _skipFiles } = _prepareFiles(allFiles, cache);

  for (const filePath of _skipFiles) {
    logger.info(`${LOGGER_TEXT.INDENT}skipped (already normalized): ${getBasename(filePath)}`);
  }
  stats.done += _skipFiles.length;

  const { entries: allEntries, errors: _errors } = await phaseLoad(
    _pendingFiles,
    config.concurrency,
    config,
    stats,
  );
  if (_errors.length > 0) {
    logger.error(`${LOGGER_TEXT.INDENT}can't read files: ${_errors.length}`);
  }
  // phaseSegment's return value (entries successfully planned) is not consumed here: phaseWrite
  // rebuilds segments per entry from the cache and needs the full entry list so cache-miss
  // entries still reach its fail/fallback handling. See phaseSegment's JSDoc for details.
  await phaseSegment(allEntries, cache, config, config.concurrency);
  await phaseWrite(allEntries, _outputBase, config, stats, cache, config.concurrency, hashFn);
};
