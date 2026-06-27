// src: scripts/modules/setfm-write.ts
// @(#): set-frontmatter Phase 4 Markdown書き込みモジュール
//       対象: writeFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { join, relative } from '@std/path';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getDirectory, getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local
// types
import type { Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  entry: ChatlogEntry,
  outputDir: string,
  inputDir: string,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  const _inputPath = entry.filePath!;

  if (!entry.frontmatter.get('title')) {
    logger.error(`  FAIL (yaml空): ${getFilename(_inputPath)}`);
    stats.fail++;
    return;
  }

  const _type = (entry.frontmatter.get('type') as string) ?? '';
  const _category = (entry.frontmatter.get('category') as string) ?? '';

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${_type}/${_category}]: ${getFilename(_inputPath)} ===`);
    logger.log(entry.frontmatter.toFrontmatter().trimEnd());
    stats.success++;
    return;
  }

  const _relPath = relative(inputDir, _inputPath);
  const _outputPath = join(outputDir, _relPath);
  const _outputSubDir = getDirectory(_outputPath);
  const _tmpFile = _outputPath + '.tmp';
  try {
    await Deno.mkdir(_outputSubDir, { recursive: true });
    await Deno.writeTextFile(_tmpFile, entry.renderEntry());
    await Deno.rename(_tmpFile, _outputPath);
    logger.info(`  OK [${_type}/${_category}]: ${getFilename(_inputPath)}`);
    stats.success++;
  } catch (e) {
    try {
      await Deno.remove(_tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${getFilename(_inputPath)}: ${e}`);
    stats.fail++;
  }
};
