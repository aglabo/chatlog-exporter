// src: scripts/modules/setfm-write.ts
// @(#): set-frontmatter Phase 4 Markdown書き込みモジュール
//       対象: writeFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── External modules
import { parse as parseYaml } from '@std/yaml';

// ─── Shared scripts
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { renderFrontmatter } from '../../../_scripts/libs/text/frontmatter-utils.ts';
// types
import type { FrontmatterFields } from '../../../_scripts/types/frontmatter.types.ts';

// ─── Local
// types
import type { FrontmatterResult, Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  entry: ChatlogEntry,
  result: FrontmatterResult,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  const filePath = entry.filePath!;

  if (!result.yaml) {
    logger.error(`  FAIL (yaml空): ${filePath.split(/[/\\]/).pop()}`);
    stats.fail++;
    return;
  }

  const _fields: FrontmatterFields = {
    session_id: entry.frontmatter.get('session_id') as string ?? '',
    date: entry.frontmatter.get('date') as string ?? '',
    project: entry.frontmatter.get('project') as string ?? '',
    slug: entry.frontmatter.get('slug') as string ?? '',
    type: result.type,
    category: result.category,
  };
  const _parsedYaml = parseYaml(result.yaml) as FrontmatterFields;
  const _allFields: FrontmatterFields = { ..._fields, ..._parsedYaml };
  const newFrontmatter = renderFrontmatter(_allFields).trimEnd();

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${result.type}/${result.category}]: ${filePath.split(/[/\\]/).pop()} ===`);
    logger.log(newFrontmatter);
    stats.success++;
    return;
  }

  const tmpFile = filePath + '.tmp';
  try {
    await Deno.writeTextFile(tmpFile, newFrontmatter + '\n' + entry.content);
    await Deno.rename(tmpFile, filePath);
    logger.info(`  OK [${result.type}/${result.category}]: ${filePath.split(/[/\\]/).pop()}`);
    stats.success++;
  } catch (e) {
    try {
      await Deno.remove(tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${filePath.split(/[/\\]/).pop()}: ${e}`);
    stats.fail++;
  }
};
