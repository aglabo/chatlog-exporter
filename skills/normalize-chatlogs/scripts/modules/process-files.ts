// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜runConcurrent ブロックの processFiles 関数モジュール
//       対象: processFiles, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// functions
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { extractChatlogPath } from '../../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getBasename, normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
import type { NormalizeCache } from '../types/cache.types.ts';
import type { NormalizeConfig, Segment, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// --- internal modules
import { extractLines, extractSegmentBaseName, segmentChatlogs, writeSegmentToFile } from './segment-io.ts';

// constants
import { BATCH_SIZE } from '../constants/normalize.constants.ts';

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

/** Derives a cache key from a source chatlog file path (same normalization as {@link extractSegmentBaseName}). */
const _toCacheKey = (filePath: string): string => extractSegmentBaseName(filePath);

/** Result of the "prepare files" phase: files still needing processing, and files already normalized. */
type _PreparedFiles = {
  pendingFiles: string[];
  skipFiles: string[];
};

/**
 * Phase 1: Validates inputDir/outputBase, discovers files, and partitions `findFiles(inputDir)`
 * results into already-normalized (skip) and pending files based on the cache.
 *
 * @param inputDir   - Source directory (already normalized)
 * @param outputBase - Base output directory (already normalized)
 * @param cache      - Cache used to detect already-normalized files across runs
 * @returns Pending file paths and the number of files skipped as already-normalized
 */
const _prepareFiles = async (
  inputDir: string,
  outputBase: string,
  cache: ChatlogCache<NormalizeCache>,
): Promise<_PreparedFiles> => {
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

  const mdFiles = await findFiles(inputDir);

  // cache に status:'done' が記録済みのファイル（正規化済み）を pending から除外
  const skipFiles = mdFiles.filter((f) => cache.read(_toCacheKey(f)).status === 'done');
  const pendingFiles = mdFiles.filter((f) => cache.read(_toCacheKey(f)).status !== 'done');

  return { pendingFiles, skipFiles };
};

/** A single chatlog file's path and raw content, prepared as input for segment planning. */
type _ChatlogInput = { filePath: string; content: string };

/** Phase 2: Reads the Markdown content for each file in `filePaths`. */
const _readInputs = (filePaths: string[]): Promise<_ChatlogInput[]> =>
  Promise.all(
    filePaths.map(async (filePath) => ({ filePath, content: await readTextFile(filePath) })),
  );

/**
 * Phase 3: Determines segment split plans for `inputs`, preferring cached `segments`
 * (resume support) over a fresh AI call, and persists newly-decided segments to the cache.
 *
 * For inputs with cached `segments`, ranges are re-sliced from the current file content via
 * {@link extractLines} (no AI call). For the remainder, `segmentChatlogs` is invoked; on
 * success, segment boundaries (`title`/`startLine`/`endLine`) are written to the cache —
 * even when `dryRun` is true, so a subsequent run does not re-invoke the AI. The cache
 * write in `dryRun` omits `status: 'done'` so the file is still writable in the following run.
 *
 * @param inputs  - Files with their Markdown content
 * @param config  - Model/timeout options forwarded to `segmentChatlogs`
 * @param cache   - Cache read for resume, written with decided segment boundaries
 * @returns Map from filePath to its planned `Segment[]`, or `null` when planning failed
 */
const _planSegments = async (
  inputs: _ChatlogInput[],
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs' | 'dryRun'>,
  cache: ChatlogCache<NormalizeCache>,
): Promise<Map<string, Segment[] | null>> => {
  const _cachedInputs = inputs.filter((i) => cache.read(_toCacheKey(i.filePath)).segments !== undefined);
  const _uncachedInputs = inputs.filter((i) => cache.read(_toCacheKey(i.filePath)).segments === undefined);

  const _resultMap = new Map<string, Segment[] | null>(
    _cachedInputs.map(({ filePath, content }) => {
      const _lines = content.split('\n');
      const _cachedSegments = cache.read(_toCacheKey(filePath)).segments!;
      return [
        filePath,
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

  if (_uncachedInputs.length === 0) {
    return _resultMap;
  }

  const _aiResultMap = await segmentChatlogs(_uncachedInputs, {
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
  });

  await Promise.all(
    _uncachedInputs.map(async ({ filePath }) => {
      const segments = _aiResultMap.get(filePath);
      _resultMap.set(filePath, segments ?? null);
      if (!segments || segments.some((s) => s.startLine === undefined || s.endLine === undefined)) {
        return;
      }
      const _cacheEntry: Partial<NormalizeCache> = {
        segments: segments.map((s) => ({ title: s.title, startLine: s.startLine!, endLine: s.endLine! })),
      };
      // write() (overwrite, not merge) is safe here: files reaching _planSegments always have
      // status === undefined (status:'done' files are filtered into skipFiles by _prepareFiles).
      await cache.write(_toCacheKey(filePath), _cacheEntry);
    }),
  );

  return _resultMap;
};

/**
 * Phase 4: Writes planned segments to output files, applying the `--single-file` fallback
 * and `failFast` behavior, and marks the file `status: 'done'` in the cache once written
 * (skipped when `dryRun`).
 *
 * @param inputs      - Files with their Markdown content (fallback needs the raw content)
 * @param segmentsMap - Planned segments per filePath, from {@link _planSegments}
 * @param outputBase  - Base output directory
 * @param config      - Processing config (dryRun, failFast, singleFile)
 * @param stats       - Mutable counters updated in place
 * @param cache       - Cache marked `status: 'done'` on successful, non-dryRun writes
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 */
const _writeSegments = async (
  inputs: _ChatlogInput[],
  segmentsMap: Map<string, Segment[] | null>,
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun' | 'failFast' | 'singleFile'>,
  stats: Stats,
  cache: ChatlogCache<NormalizeCache>,
  hashFn?: HashProvider,
): Promise<void> => {
  for (const { filePath, content } of inputs) {
    const _entry = new ChatlogEntry(content, { filePath });
    const _projectVal = _entry.frontmatter.get('project');
    const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
    const outputDir = resolveOutputDir(outputBase, filePath, _project);
    await Deno.mkdir(outputDir, { recursive: true });

    let segments = segmentsMap.get(filePath) ?? null;

    if (segments === null && config.singleFile) {
      // fallback: content 全体を1セグメントとして使う
      segments = [{
        title: getBasename(filePath).replace(/-[0-9a-f]{7}$/, ''),
        summary: '(auto-generated: AI segmentation failed)',
        content: content,
      }];
      logger.info(`${LOGGER_TEXT.INDENT}fallback (1-segment): ${getBasename(filePath)}`);
      stats.fallback++;
    } else if (segments === null) {
      logger.warn(`${LOGGER_TEXT.INDENT}failed (no segments returned): ${getBasename(filePath)}`);
      stats.fail++;
      if (config.failFast) {
        throw new ChatlogError('FailFast', 'SegmentFailed', `fail-fast triggered by: ${getBasename(filePath)}`);
      }
      continue;
    }

    for (let i = 0; i < segments.length; i++) {
      await writeSegmentToFile(
        outputDir,
        filePath,
        i,
        segments[i],
        _entry.frontmatter,
        config.dryRun,
        stats,
        hashFn,
      );
    }

    if (!config.dryRun) {
      await cache.update(_toCacheKey(filePath), { status: 'done' });
    }
  }
};

/**
 * Processes markdown files under `inputDir` by segmenting each via AI and writing output.
 *
 * Flow: {@link _prepareFiles} (discover + skip already-normalized) → chunked
 * {@link _readInputs} → {@link _planSegments} (AI call, or cached segments on resume) →
 * {@link _writeSegments} (write output, update cache).
 * Updates `stats` in place: `fail` increments on AI error, `success` on each write.
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

  const cache = new ChatlogCache<NormalizeCache>('normalize-cache');
  await cache.ready;

  const { pendingFiles: _pendingFiles, skipFiles: _skipFiles } = await _prepareFiles(_inputDir, _outputBase, cache);

  for (const filePath of _skipFiles) {
    logger.info(`${LOGGER_TEXT.INDENT}skipped (already normalized): ${getBasename(filePath)}`);
  }
  stats.skip += _skipFiles.length;

  const _chunkSize = config.singleFile ? 1 : BATCH_SIZE;
  const _chunks = Array.from(
    { length: Math.ceil(_pendingFiles.length / _chunkSize) },
    (_, i) => _pendingFiles.slice(i * _chunkSize, (i + 1) * _chunkSize),
  );

  await runConcurrent(_chunks, async (chunk) => {
    const _inputs = await _readInputs(chunk);
    const _segmentsMap = await _planSegments(_inputs, config, cache);
    await _writeSegments(_inputs, _segmentsMap, _outputBase, config, stats, cache, hashFn);
  }, config.concurrency);
};
