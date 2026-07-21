// src: scripts/modules/file-io.ts
// @(#): ファイル出力と結果レポートのユーティリティ
//       対象: writeOutput, reportResults
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules───────────────────────────
// types
import type { GlobProvider } from '../../../_scripts/types/providers.types.ts';

// ─── internal modules───────────────────────────
// types
import type { Stats } from '../types/normalize.types.ts';

// functions
// -- file operations --
import { backupOldPath } from '../../../_scripts/libs/file-ops/backup-old-path.ts';

// -- io --
import { logger } from '../../../_scripts/libs/io/logger.ts';

// -- text --
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';

// ─── Functions

/**
 * Writes `content` to `outputPath` using a tmp-then-rename atomic pattern.
 *
 * Behavior:
 * 1. `dryRun=true` → log and return `false` without writing.
 * 2. `outputPath` already exists → backup via `backupOldPath` (rename to `<basename>.old-NN.md`, first available slot 01–99), then write new file.
 * 3. Write to `outputPath + ".tmp"`, then rename to `outputPath`.
 *
 * @param outputPath - Destination file path
 * @param content    - Text content to write
 * @param dryRun     - When true, no disk writes are performed
 * @param glob       - Optional glob provider for backup slot detection
 * @returns `true` on successful write; `false` when `dryRun=true` (no write performed)
 */
export const writeOutput = async (
  outputPath: string,
  content: string,
  dryRun: boolean,
  glob?: GlobProvider,
): Promise<boolean> => {
  if (dryRun) {
    logger.dryrun(`would write: ${outputPath}`);
    return false;
  }

  await backupOldPath(outputPath, glob);

  const tmpPath = outputPath + '.tmp';
  await Deno.writeTextFile(tmpPath, normalizeLine(content));
  await Deno.rename(tmpPath, outputPath);
  return true;
};

/**
 * Outputs a summary report of batch processing results to stdout.
 *
 * Format: `Results: success=<n>, skip=<n>, fail=<n>`
 * When `stats.fail > 0`, an additional warning line is emitted to surface
 * the failure count explicitly.
 *
 * @param stats - Counters collected across a batch run
 */
export const reportResults = (stats: Stats): void => {
  logger.info(`Results: success=${stats.success}, skip=${stats.skip}, fallback=${stats.fallback}, fail=${stats.fail}`);
  if (stats.fallback > 0) {
    logger.info(`::info:: ${stats.fallback} file(s) processed via fallback (1-segment)`);
  }
  if (stats.fail > 0) {
    logger.warn(`WARNING: ${stats.fail} file(s) failed`);
  }
};
