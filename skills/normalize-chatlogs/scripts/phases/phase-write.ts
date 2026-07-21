// src: skills/normalize-chatlogs/scripts/phases/phase-write.ts
// @(#): セグメント書き込みフェーズ
//       対象: phaseWrite, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// functions
import { extractChatlogPath } from '../../../_scripts/libs/file-io/resolve-directory.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// classes
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';

// ─── Local
import { extractSegmentBaseName, writeSegmentToFile } from '../modules/segment-io.ts';
// types
import type { NormalizeCache } from '../types/cache.types.ts';
import type { NormalizeConfig, Segment, Stats } from '../types/normalize.types.ts';

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

/**
 * Writes planned segments to output files, applying the `--single-file` fallback
 * and `failFast` behavior, and marks the file `status: 'done'` in the cache once written
 * (skipped when `dryRun`).
 *
 * @param entries     - Files loaded as `ChatlogEntry` (fallback needs `entry.content`)
 * @param segmentsMap - Planned segments per filePath, from {@link phasePlan}
 * @param outputBase  - Base output directory
 * @param config      - Processing config (dryRun, failFast, singleFile)
 * @param stats       - Mutable counters updated in place
 * @param cache       - Cache marked `status: 'done'` on successful, non-dryRun writes
 * @param concurrency - Parallelism for writing segments across `entries`
 * @param hashFn      - Optional hash generator for output file names (injectable for testing)
 */
export const phaseWrite = async (
  entries: ChatlogEntry[],
  segmentsMap: Map<string, Segment[] | null>,
  outputBase: string,
  config: Pick<NormalizeConfig, 'dryRun' | 'failFast' | 'singleFile'>,
  stats: Stats,
  cache: ChatlogCache<NormalizeCache>,
  concurrency: number,
  hashFn?: HashProvider,
): Promise<void> => {
  await runConcurrent(entries, async (entry) => {
    const filePath = entry.filePath!;
    const _projectVal = entry.frontmatter.get('project');
    const _project = typeof _projectVal === 'string' ? _projectVal : undefined;
    const outputDir = resolveOutputDir(outputBase, filePath, _project);
    await Deno.mkdir(outputDir, { recursive: true });

    let segments = segmentsMap.get(filePath) ?? null;

    if (segments === null && config.singleFile) {
      // fallback: content 全体を1セグメントとして使う
      segments = [{
        title: getBasename(filePath).replace(/-[0-9a-f]{7}$/, ''),
        summary: '(auto-generated: AI segmentation failed)',
        content: entry.content,
      }];
      logger.info(`${LOGGER_TEXT.INDENT}fallback (1-segment): ${getBasename(filePath)}`);
      stats.fallback++;
    } else if (segments === null) {
      logger.warn(`${LOGGER_TEXT.INDENT}failed (no segments returned): ${getBasename(filePath)}`);
      stats.fail++;
      if (config.failFast) {
        throw new ChatlogError('FailFast', 'SegmentFailed', `fail-fast triggered by: ${getBasename(filePath)}`);
      }
      return;
    }

    await Promise.all(
      segments.map((segment, i) =>
        writeSegmentToFile(outputDir, filePath, i, segment, entry.frontmatter, config.dryRun, stats, hashFn)
      ),
    );

    if (!config.dryRun) {
      await cache.update(_toCacheKey(filePath), { status: 'done' });
    }
  }, concurrency);
};
