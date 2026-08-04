// src: skills/normalize-chatlogs/scripts/libs/stats-utils.ts
// @(#): normalize-chatlogs バッチ処理カウンター（Stats）の初期化・レポートユーティリティ
//       対象: initStats, reportStats
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { logger } from '../../../_cle-libs/libs/io/logger.ts';

// ─── Local
// types
import type { Stats } from '../types/normalize.types.ts';

/** Creates a zero-initialized `Stats` counter set. */
export const initStats = (): Stats => ({
  success: 0,
  fail: 0,
  done: 0,
  error: 0,
  skip: 0,
});

/**
 * Outputs a summary report of batch processing results to stdout.
 *
 * Format: `Results: success=<n>, done=<n>, skip=<n>, fail=<n>, error=<n>`
 * When `stats.fail > 0` or `stats.error > 0`, an additional warning line is emitted to surface
 * the count explicitly.
 *
 * @param stats - Counters collected across a batch run
 */
export const reportStats = (stats: Stats): void => {
  logger.info(
    `Results: success=${stats.success}, done=${stats.done}, skip=${stats.skip}, fail=${stats.fail}, error=${stats.error}`,
  );
  if (stats.fail > 0) {
    logger.warn(`WARNING: ${stats.fail} file(s) failed`);
  }
  if (stats.error > 0) {
    logger.warn(`WARNING: ${stats.error} file(s) errored`);
  }
};
