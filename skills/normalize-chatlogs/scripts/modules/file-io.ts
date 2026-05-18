// src: scripts/modules/file-io.ts
// @(#): ファイル出力と結果レポートのユーティリティ
//       対象: writeOutput, reportResults
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// shared modules
// ─────────────────────────────────────────────

// -- classes --
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// -- types --
import type { ListDirProvider } from '../../../_scripts/types/providers.types.ts';

// -- file-ops --
import { backupOldPath } from '../../../_scripts/libs/file-ops/backup-old-path.ts';

// -- io --
import { logger } from '../../../_scripts/libs/io/logger.ts';

// -- text --
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';

// -- local types --
import type { Stats } from '../types/normalize.types.ts';

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Writes `content` to `outputPath` using a tmp-then-rename atomic pattern.
 *
 * Behavior:
 * 1. `dryRun=true` → log and return without writing.
 * 2. `outputPath` contains `chatlogs/` → throw Error (R-010 guard).
 * 3. `outputPath` already exists → backup via `backupOldPath` (rename to `<basename>.old-NN.md`, first available slot 01–99), then write new file, `stats.success++`.
 * 4. Write to `outputPath + ".tmp"`, then rename to `outputPath`, `stats.success++`.
 *
 * @param outputPath - Destination file path
 * @param content    - Text content to write
 * @param dryRun     - When true, no disk writes are performed
 * @param stats      - Mutable counters updated in place
 */
export const writeOutput = async (
  outputPath: string,
  content: string,
  dryRun: boolean,
  stats: Stats,
  listDir: ListDirProvider = (dir) => Array.fromAsync(Deno.readDir(dir), (e) => e.name),
): Promise<void> => {
  if (dryRun) {
    logger.info(`[dry-run] would write: ${outputPath}`);
    return;
  }

  if (outputPath.includes('chatlogs/')) {
    throw new ChatlogError(
      'ForbiddenOutput',
      'ForbiddenPath',
      `writing to input directory is forbidden: ${outputPath}`,
    );
  }

  await backupOldPath(outputPath, listDir);

  const tmpPath = outputPath + '.tmp';
  await Deno.writeTextFile(tmpPath, normalizeLine(content));
  await Deno.rename(tmpPath, outputPath);
  stats.success++;
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
  logger.info(`Results: success=${stats.success}, skip=${stats.skip}, fail=${stats.fail}`);
  if (stats.fail > 0) {
    logger.warn(`WARNING: ${stats.fail} file(s) failed`);
  }
};
