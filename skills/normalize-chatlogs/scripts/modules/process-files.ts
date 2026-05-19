// src: skills/normalize-chatlogs/scripts/modules/process-files.ts
// @(#): findFiles〜runConcurrent ブロックの processFiles 関数モジュール
//       対象: processFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// functions
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

// --- internal modules
import { writeOutput } from './file-io.ts';
import {
  attachFrontmatter,
  generateOutputFileName,
  generateSegmentFile,
  segmentChatlogs,
} from './segment-io.ts';

// ─── Directory Resolution ─────────────────────────────────────────────────────

/**
 * Resolves the output directory from an input directory path.
 *
 * If inputDir matches the chatlog format `chatlogs/<agent>/<year>/<yearMonth>`,
 * the output is `<outputBase>/<agent>/<year>/<yearMonth>/<project>`.
 * Otherwise (arbitrary path), the output is `<outputBase>/<project>`.
 * If project is undefined or empty string, "misc" is used.
 *
 * @param inputDir   - The resolved input directory path
 * @param outputBase - The base output directory
 * @param project    - Optional project name
 * @returns The resolved output directory path
 */
const _resolveOutputDir = (inputDir: string, outputBase: string, project: string | undefined): string => {
  const effectiveProject = project || 'misc';
  const chatlogMatch = inputDir.match(/chatlogs\/([^/]+)\/(\d{4})\/(\d{4}-\d{2})(?:\/|$)/);
  if (chatlogMatch) {
    const [, agent, year, yearMonth] = chatlogMatch;
    return `${outputBase}/${agent}/${year}/${yearMonth}/${effectiveProject}`;
  }
  return `${outputBase}/${effectiveProject}`;
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
  config: Pick<NormalizeConfig, 'dryRun' | 'concurrency'>,
  stats: Stats,
  hashFn?: HashProvider,
): Promise<void> => {
  const mdFiles = await findFiles(inputDir);
  await runConcurrent(mdFiles, async (filePath) => {
    const _text = await readTextFile(filePath);
    const _entry = new ChatlogEntry(_text);

    const segments = await segmentChatlogs(filePath, _text);
    if (segments === null) {
      stats.fail++;
      return;
    }

    const _projectVal = _entry.frontmatter.get('project');
    const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
    const outputDir = _resolveOutputDir(inputDir, outputBase, _project);
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
      const outputPath = `${outputDir}/${outputFileName}`;
      await writeOutput(outputPath, fullContent, config.dryRun, stats);
    }
  }, config.concurrency);
};
