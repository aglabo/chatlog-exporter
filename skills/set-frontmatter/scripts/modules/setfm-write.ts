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
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local
// types
import type { Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  entry: ChatlogEntry,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  const filePath = entry.filePath!;

  if (!entry.frontmatter.get('title')) {
    logger.error(`  FAIL (yaml空): ${getFilename(filePath)}`);
    stats.fail++;
    return;
  }

  const type = (entry.frontmatter.get('type') as string) ?? '';
  const category = (entry.frontmatter.get('category') as string) ?? '';

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${type}/${category}]: ${getFilename(filePath)} ===`);
    logger.log(entry.frontmatter.toFrontmatter().trimEnd());
    stats.success++;
    return;
  }

  const tmpFile = filePath + '.tmp';
  try {
    await Deno.writeTextFile(tmpFile, entry.renderEntry());
    await Deno.rename(tmpFile, filePath);
    logger.info(`  OK [${type}/${category}]: ${getFilename(filePath)}`);
    stats.success++;
  } catch (e) {
    try {
      await Deno.remove(tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${getFilename(filePath)}: ${e}`);
    stats.fail++;
  }
};
