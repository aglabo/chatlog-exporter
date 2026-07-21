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

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
import type { NormalizeCache } from '../types/cache.types.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// --- internal modules
import { phaseLoad } from '../phases/phase-load.ts';
import { phasePlan } from '../phases/phase-plan.ts';
import { phaseWrite } from '../phases/phase-write.ts';
import { extractSegmentBaseName } from './segment-io.ts';

/** Derives a cache key from a source chatlog file path (same normalization as {@link extractSegmentBaseName}). */
const _toCacheKey = (filePath: string): string => extractSegmentBaseName(filePath);

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
  const skipFiles = mdFiles.filter((f) => cache.read(_toCacheKey(f)).status === 'done');
  const pendingFiles = mdFiles.filter((f) => cache.read(_toCacheKey(f)).status !== 'done');

  return { pendingFiles, skipFiles };
};

/**
 * Processes markdown files under `inputDir` by segmenting each via AI and writing output.
 *
 * Flow: {@link _validateDirs} (validate, before cache init) → `findFiles` (discover) →
 * {@link _prepareFiles} (skip already-normalized) → {@link phaseLoad} (load, partition
 * load errors) → {@link phasePlan} (AI call, or cached segments on resume) →
 * {@link phaseWrite} (write output, update cache).
 * Updates `stats` in place: `fail` increments on load error or AI error, `success` on each write.
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
  stats.skip += _skipFiles.length;

  const { entries } = await phaseLoad(_pendingFiles, config.concurrency, config, stats);
  const segmentsMap = await phasePlan(entries, config, cache);
  await phaseWrite(entries, segmentsMap, _outputBase, config, stats, cache, config.concurrency, hashFn);
};
