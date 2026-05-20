// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜runConcurrent ブロックの processFiles 関数モジュール
//       対象: processFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// functions
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { dirExists } from '../../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// --- internal modules
import { writeOutput } from './file-io.ts';
import {
  attachFrontmatter,
  generateOutputFileName,
  generateSegmentFile,
  segmentChatlogsBatch,
} from './segment-io.ts';

// constants
import { BATCH_SIZE } from '../constants/normalize.constants.ts';

/**
 * Extracts the `<agent>/<yyyy>/<yyyy-mm>` path segment from a file path.
 *
 * Matches the `chatlogs/<agent>/<yyyy>/<yyyy-mm>` pattern and returns
 * `<agent>/<yyyy>/<yyyy-mm>`. Returns `''` if the pattern is not found.
 *
 * @param filePath - Path to the source chatlog file
 * @returns Path segment like `'claude/2026/2026-04'`, or `''`
 */
export const extractChatlogPath = (filePath: string): string => {
  const match = filePath.match(/chatlogs\/([^/]+)\/(\d{4})\/(\d{4}-\d{2})/);
  if (match) {
    const [, agent, year, yearMonth] = match;
    return `${agent}/${year}/${yearMonth}`;
  }
  return '';
};

/**
 * Resolves the output directory for a single file.
 *
 * Combines {@link extractChatlogPath} with the project name to build the full output path.
 * If `filePath` contains `chatlogs/<agent>/<yyyy>/<yyyy-mm>`, returns
 * `<outputBase>/<agent>/<yyyy>/<yyyy-mm>/<project>`.
 * Otherwise returns `<outputBase>/<project>`.
 * Falls back to `'misc'` when `project` is undefined.
 *
 * @param outputBase - Base output directory (normalized)
 * @param filePath   - Path to the source chatlog file
 * @param project    - Project name from frontmatter, or undefined
 * @returns Resolved output directory path
 */
export const resolveOutputDir = (outputBase: string, filePath: string, project: string | undefined): string => {
  const chatlogPath = extractChatlogPath(normalizePath(filePath));
  const effectiveProject = project ?? 'misc';
  return chatlogPath
    ? `${outputBase}/${chatlogPath}/${effectiveProject}`
    : `${outputBase}/${effectiveProject}`;
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
  config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model'>,
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

  const _chunks: string[][] = [];
  for (let i = 0; i < mdFiles.length; i += BATCH_SIZE) {
    _chunks.push(mdFiles.slice(i, i + BATCH_SIZE));
  }

  await runConcurrent(_chunks, async (chunk) => {
    const _inputs = await Promise.all(
      chunk.map(async (filePath) => {
        const content = await readTextFile(filePath);
        return { filePath, content };
      }),
    );

    const _resultMap = await segmentChatlogsBatch(_inputs, { model: config.model });

    for (const { filePath, content } of _inputs) {
      const segments = _resultMap.get(filePath) ?? null;
      if (segments === null) {
        stats.fail++;
        continue;
      }

      const _entry = new ChatlogEntry(content);
      const _projectVal = _entry.frontmatter.get('project');
      const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
      const outputDir = resolveOutputDir(_outputBase, filePath, _project);
      await Deno.mkdir(outputDir, { recursive: true });

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const outputFileName = await generateOutputFileName(filePath, i, hashFn);
        const segmentContent = generateSegmentFile(segment);
        const fullContent = attachFrontmatter(segmentContent, _entry.frontmatter, {
          title: segment.title,
          log_id: outputFileName.replace(/\.md$/, ''),
          summary: segment.summary,
        });
        await writeOutput(`${outputDir}/${outputFileName}`, fullContent, config.dryRun, stats);
      }
    }
  }, config.concurrency);
};
