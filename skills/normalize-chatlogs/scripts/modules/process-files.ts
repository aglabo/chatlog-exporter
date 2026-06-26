// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜runConcurrent ブロックの processFiles 関数モジュール
//       対象: processFiles, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- std
import { expandGlob } from '@std/fs';

// --- shared
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
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// --- internal modules
import { extractSegmentBaseName, segmentChatlogs, writeSegmentToFile } from './segment-io.ts';

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

/**
 * Returns true if an output file for `filePath` already exists anywhere under `outputBase`.
 *
 * Searches recursively using the glob pattern outputBase/{@code **}/baseName-*.md,
 * so any project subdirectory structure is covered. Returns false when no match is found.
 *
 * @param filePath   - Source chatlog file path
 * @param outputBase - Base output directory
 * @returns Promise resolving to true if already normalized, false otherwise
 */
const _isAlreadyNormalized = async (
  filePath: string,
  outputBase: string,
): Promise<boolean> => {
  const _baseName = extractSegmentBaseName(filePath);
  const _pattern = `${outputBase}/**/${_baseName}-*.md`;
  for await (const _entry of expandGlob(_pattern)) {
    if (_entry.isFile) { return true; }
  }
  return false;
};

/**
 * Processes markdown files under `inputDir` by segmenting each via AI and writing output.
 *
 * Discovers files via `findFiles(inputDir)`, then for each file: reads content,
 * extracts frontmatter, calls `segmentChatlogs`, and for each segment generates
 * an output file and writes it (respecting dryRun).
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
  // 0. パス正規化
  const _inputDir = normalizePath(inputDir);
  const _outputBase = normalizePath(outputBase);

  // 1. inputDir 存在確認
  if (!await dirExists(_inputDir)) {
    throw new ChatlogError('InputNotFound', 'InputDir', `inputDir not found or not a directory: ${_inputDir}`);
  }

  // 2. outputBase 作成・存在確認
  await Deno.mkdir(_outputBase, { recursive: true });
  if (!await dirExists(_outputBase)) {
    throw new ChatlogError('FileDirNotFound', 'OutputBase', `outputBase could not be created: ${_outputBase}`);
  }

  // 3. containment チェック（outputBase が inputDir 配下でないこと）
  if (_outputBase.startsWith(_inputDir + '/') || _outputBase === _inputDir) {
    throw new ChatlogError(
      'ForbiddenOutput',
      'OutputInsideInput',
      `outputBase must not be inside inputDir: ${_outputBase}`,
    );
  }

  const mdFiles = await findFiles(_inputDir);

  // 正規化済みファイルを事前にフィルタ
  const _normalized = await Promise.all(mdFiles.map((f) => _isAlreadyNormalized(f, _outputBase)));
  const _skipFiles = mdFiles.filter((_, i) => _normalized[i]);
  const _pendingFiles = mdFiles.filter((_, i) => !_normalized[i]);

  for (const filePath of _skipFiles) {
    logger.info(`  skipped (already normalized): ${getBasename(filePath)}`);
    stats.skip++;
  }

  const _chunkSize = config.singleFile ? 1 : BATCH_SIZE;
  const _chunks = Array.from(
    { length: Math.ceil(_pendingFiles.length / _chunkSize) },
    (_, i) => _pendingFiles.slice(i * _chunkSize, (i + 1) * _chunkSize),
  );

  await runConcurrent(_chunks, async (chunk) => {
    const _inputs = await Promise.all(
      chunk.map(async (filePath) => {
        const content = await readTextFile(filePath);
        return { filePath, content };
      }),
    );

    const _resultMap = await segmentChatlogs(_inputs, {
      model: config.model,
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    });

    for (const { filePath, content } of _inputs) {
      const _entry = new ChatlogEntry(content);
      const _projectVal = _entry.frontmatter.get('project');
      const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
      const outputDir = resolveOutputDir(_outputBase, filePath, _project);
      await Deno.mkdir(outputDir, { recursive: true });

      let segments = _resultMap.get(filePath) ?? null;

      if (segments === null && config.singleFile) {
        // fallback: content 全体を1セグメントとして使う
        segments = [{
          title: getBasename(filePath).replace(/-[0-9a-f]{7}$/, ''),
          summary: '(auto-generated: AI segmentation failed)',
          content: content,
        }];
        logger.info(`  fallback (1-segment): ${getBasename(filePath)}`);
        stats.fallback++;
      } else if (segments === null) {
        logger.warn(`  failed (no segments returned): ${getBasename(filePath)}`);
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
    }
  }, config.concurrency);
};
