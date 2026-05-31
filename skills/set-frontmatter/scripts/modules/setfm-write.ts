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
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { renderFrontmatter } from '../../../_scripts/libs/text/frontmatter-utils.ts';

// ─── Local
// types
import type { EntryMeta } from '../types/entry-meta.types.ts';
import type { FrontmatterResult, Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  fm: EntryMeta,
  result: FrontmatterResult,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  if (!result.yaml) {
    logger.error(`  FAIL (yaml空): ${fm.file.split(/[/\\]/).pop()}`);
    stats.fail++;
    return;
  }

  const _fields: Record<string, unknown> = {
    session_id: fm.sessionId,
    date: fm.date,
    project: fm.project,
    slug: fm.slug,
    type: result.type,
    category: result.category,
  };
  const _parsedYaml = parseYaml(result.yaml) as Record<string, unknown>;
  const _allFields = { ..._fields, ..._parsedYaml };
  const newFrontmatter = renderFrontmatter(_allFields).trimEnd();

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${result.type}/${result.category}]: ${fm.file.split(/[/\\]/).pop()} ===`);
    logger.log(newFrontmatter);
    stats.success++;
    return;
  }

  const tmpFile = fm.file + '.tmp';
  try {
    await Deno.writeTextFile(tmpFile, newFrontmatter + '\n' + fm.fullBody);
    await Deno.rename(tmpFile, fm.file);
    logger.info(`  OK [${result.type}/${result.category}]: ${fm.file.split(/[/\\]/).pop()}`);
    stats.success++;
  } catch (e) {
    try {
      await Deno.remove(tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${fm.file.split(/[/\\]/).pop()}: ${e}`);
    stats.fail++;
  }
};
