// src: scripts/modules/filter/sweep-discards.ts
// @(#): DISCARD マーク済みファイルの一括削除（マーク後スイープ）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import type { ChatlogCache } from '../../../../_scripts/classes/ChatlogCache.class.ts';
// functions
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { LOGGER_TEXT } from '../../../../_scripts/constants/logger.constants.ts';

// ─── internal ───
// functions
import { FILTER_DECISIONS } from '../../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../../types/cache.types.ts';
import type { FilterStats } from '../../types/stats.types.ts';

// ─────────────────────────────────────────────
// スイープ処理
// ─────────────────────────────────────────────

/**
 * キャッシュ上 `decision: DISCARD` とマークされたが、実ファイルがまだ存在するものを一括削除する。
 *
 * `processChunk` は確定判定のみをキャッシュに書き込み削除を行わないため（mark-then-sweep）、
 * 今回新たにマークされたファイルと、前回実行時に削除されずキャッシュだけマーク済みだったゾンビファイルの
 * 両方をこの関数でまとめて処理する。
 *
 * 削除成功時はキャッシュエントリ自体を削除し、削除失敗時はキャッシュの decision を ERROR にマークする。
 *
 * @param allFiles - 削除対象を判定する候補パス一覧（通常は列挙した全ファイル）
 * @param cache - 判定結果キャッシュ
 * @param stats - 削除件数・スキップ件数・エラー件数を加算する統計オブジェクト
 * @param dryRun - `true` の場合は削除を行わず、ファイルごとに `stats.skip` に計上する
 * @param concurrency - 同時実行する存在確認・削除処理の最大並列数。
 */
export const sweepDiscards = async (
  allFiles: string[],
  cache: ChatlogCache<CLEResult>,
  stats: FilterStats,
  dryRun: boolean,
  concurrency: number,
): Promise<void> => {
  const _isMarkedDiscard = (filePath: string): boolean => cache.read(filePath).decision === FILTER_DECISIONS.DISCARD;
  const _isExistingFile = async (filePath: string): Promise<boolean> => await fileExists(filePath);

  const targets = (await runConcurrent(
    allFiles.filter(_isMarkedDiscard),
    async (filePath) => (await _isExistingFile(filePath)) ? filePath : null,
    concurrency,
  )).filter((filePath): filePath is string => filePath !== null);

  await runConcurrent(targets, async (filePath) => {
    if (dryRun) {
      stats.skip++;
      logger.dryrun(`${LOGGER_TEXT.INDENT}skipped: ${getFilename(filePath)}`);
      return;
    }

    logger.log(`DISCARD: ${filePath}`);
    if (await removeFile(filePath, { throwFileIoError: false })) {
      stats.remove++;
      await cache.delete(filePath);
      logger.info(`${LOGGER_TEXT.INDENT}removed: ${getFilename(filePath)}`);
    } else {
      stats.error++;
      await cache.write(filePath, { ...cache.read(filePath), decision: FILTER_DECISIONS.ERROR });
      logger.warn(`${LOGGER_TEXT.INDENT}Error: cannot removed: ${getFilename(filePath)}`);
    }
  }, concurrency);
};
