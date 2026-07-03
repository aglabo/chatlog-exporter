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
import { ChatlogWorks } from '../../../_scripts/classes/ChatlogWorks.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getDirectory, getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local
// types
import { CACHE_STATUSES } from '../../../_scripts/types/cache-status.const.types.ts';
import type { SetfmCache } from '../types/cache.types.ts';

// ─────────────────────────────────────────────
// フィールド充足チェック
// ─────────────────────────────────────────────

/**
 * エントリの frontmatter に 6 フィールドすべてが充足しているか判定する。
 * - type: string かつ非空
 * - category: string かつ非空
 * - title: string かつ非空
 * - summary: string かつ非空
 * - topics: string[] かつ length >= 1
 * - tags: string[] かつ length >= 1
 *
 * @param entry - チェック対象の `ChatlogEntry`
 * @returns 6フィールドすべて充足しているとき `true`
 */
export const hasFrontmatterFields = (entry: ChatlogEntry): boolean => {
  const type = entry.frontmatter.get('type');
  const category = entry.frontmatter.get('category');
  const title = entry.frontmatter.get('title');
  const summary = entry.frontmatter.get('summary');
  const topics = entry.frontmatter.get('topics');
  const tags = entry.frontmatter.get('tags');
  return (
    typeof type === 'string' && type.length > 0
    && typeof category === 'string' && category.length > 0
    && typeof title === 'string' && title.length > 0
    && typeof summary === 'string' && summary.length > 0
    && Array.isArray(topics) && topics.length >= 1
    && Array.isArray(tags) && tags.length >= 1
  );
};

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  entry: ChatlogEntry,
  cache: ChatlogWorks<SetfmCache>,
  outputDir: string,
  inputDir: string,
  dryRun: boolean,
): Promise<boolean> => {
  const _inputPath = entry.filePath!;

  if (!entry.frontmatter.get('title')) {
    logger.error(`  FAIL (yaml空): ${getFilename(_inputPath)}`);
    return false;
  }

  const _type = (entry.frontmatter.get('type') as string) ?? '';
  const _category = (entry.frontmatter.get('category') as string) ?? '';

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${_type}/${_category}]: ${getFilename(_inputPath)} ===`);
    logger.log(entry.frontmatter.toFrontmatter().trimEnd());
    return true;
  }

  const _relPath = relative(inputDir, _inputPath);
  const _outputPath = join(outputDir, _relPath);
  const _outputSubDir = getDirectory(_outputPath);
  const _tmpFile = _outputPath + '.tmp';
  try {
    await Deno.mkdir(_outputSubDir, { recursive: true });
    await Deno.writeTextFile(_tmpFile, entry.renderEntry());
    await Deno.rename(_tmpFile, _outputPath);
    const _cached = cache.read(_inputPath);
    await cache.write(_inputPath, { ..._cached, status: CACHE_STATUSES.WRITTEN });
    return true;
  } catch (e) {
    try {
      await Deno.remove(_tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${getFilename(_inputPath)}: ${e}`);
    return false;
  }
};
