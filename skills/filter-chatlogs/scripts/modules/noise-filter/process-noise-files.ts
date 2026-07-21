// src: scripts/modules/noise-filter/process-noise-files.ts
// @(#): ノイズファイルのリスト処理（分類・削除・dry-run）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { parseConversation } from '../../../../_scripts/libs/chatlogs/conversation-utils.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../../_scripts/libs/parallel/concurrency.ts';
// classes
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── internal ───
// types
import type { FilterProcessOptions } from '../../types/filter.types.ts';
import type { NoiseDiscardFile } from '../../types/noise-filter.types.ts';
import type { NoiseFilterStats } from '../../types/stats.types.ts';
// functions
import { classifyConversation, classifyFile } from '../../libs/classify-file.ts';
// constants
import { FILTER_DECISIONS } from '../../types/filter-decision.const.types.ts';

// ─────────────────────────────────────────────
// ファイルリスト処理
// ─────────────────────────────────────────────

/**
 * `ChatlogEntry` 配列を `classifyFile` でファイル名パターン判定し、ノイズ確定/通過に分類する。
 *
 * ファイル名パターンに一致したエントリは `NoiseDiscardFile`（`decision: FILTER_DECISIONS.DISCARD`）
 * として `discardFiles` に、一致しなかったエントリは `passEntries` に振り分ける純粋関数。
 *
 * @param entries - 判定対象の `ChatlogEntry` 配列
 * @returns ファイル名ノイズ判定確定ファイル（`discardFiles`）と、通過エントリ（`passEntries`）
 */
export const _phase0ClassifyByFilename = (
  entries: ChatlogEntry[],
): { discardFiles: NoiseDiscardFile[]; passEntries: ChatlogEntry[] } => {
  const classified = entries.map((entry) => ({
    entry,
    discard: classifyFile({ filePath: entry.filePath as string, filename: entry.filename as string }),
  }));

  const discardFiles = classified
    .filter((c): c is { entry: ChatlogEntry; discard: NoiseDiscardFile } => c.discard !== null)
    .map((c) => c.discard);

  const passEntries = classified
    .filter((c) => c.discard === null)
    .map((c) => c.entry);

  return { discardFiles, passEntries };
};

/**
 * `ChatlogEntry` 配列を `classifyConversation` の判定でノイズ確定/keep に分類する。
 *
 * 会話内容がノイズ判定された（`reason !== null`）エントリは `NoiseDiscardFile`
 * （`decision: FILTER_DECISIONS.DISCARD`、`reason` は `classifyConversation` の判定理由）として
 * `discardFiles` に、それ以外は `filePath` のみ `keepFiles` に振り分ける純粋関数。
 *
 * @param entries - 判定対象の `ChatlogEntry` 配列
 * @returns ノイズ判定確定ファイル（`discardFiles`）と、通過ファイルパス（`keepFiles`）
 */
export const _phase2ClassifyConversations = (
  entries: ChatlogEntry[],
): { discardFiles: NoiseDiscardFile[]; keepFiles: string[] } => {
  const classified = entries.map((entry) => ({
    entry,
    reason: classifyConversation(parseConversation(entry.content)),
  }));

  const discardFiles = classified
    .filter((c): c is { entry: ChatlogEntry; reason: string } => c.reason !== null)
    .map((c) => ({
      filePath: c.entry.filePath as string,
      filename: c.entry.filename as string,
      reason: c.reason,
      decision: FILTER_DECISIONS.DISCARD,
    }));

  const keepFiles = classified
    .filter((c) => c.reason === null)
    .map((c) => c.entry.filePath as string);

  return { discardFiles, keepFiles };
};

/**
 * ノイズ判定確定ファイルを並列に削除（または dry-run 出力）し、stats を加算する。
 *
 * `dryRun === true` のときは削除を行わず、ファイルパスと判定理由を `logger.info`（stderr）に
 * 出力したうえで `stats.skip` に加算する。`dryRun === false` のときは `removeFile()` を呼び、
 * 成功なら `stats.remove` に加算してファイルパスと判定理由を `logger.info` に出力し、失敗
 * （ファイルが既に存在しない等）なら `removeFile()` 内部で `logger.warn` にエラー内容が
 * 出力された上で `stats.error` に加算する。
 *
 * @param discardFiles - ノイズ判定確定ファイル（`NoiseDiscardFile[]`）
 * @param stats - 加算対象の処理統計オブジェクト
 * @param dryRun - `true` のとき実削除を行わない
 * @param concurrency - 同時実行する削除処理の最大並列数。
 */
export const _phase3DiscardOrSkip = async (
  discardFiles: NoiseDiscardFile[],
  stats: NoiseFilterStats,
  dryRun: boolean,
  concurrency: number,
): Promise<void> => {
  await runConcurrent(discardFiles, async ({ filePath, reason }) => {
    if (dryRun) {
      logger.dryrun(`skip: ${filePath} (${reason})`);
      stats.skip++;
      return;
    }
    if (await removeFile(filePath, { throwFileIoError: false })) {
      logger.info(`deleted: ${filePath} (${reason})`);
      stats.remove++;
    } else {
      // log output in removeFIle() already, so just count up stats.error
      stats.error++;
    }
  }, concurrency);
};

/**
 * エントリリストを分類し、ノイズ判定確定ファイルを削除（または dry-run 出力）する。
 *
 * `_phase0ClassifyByFilename` → `_phase2ClassifyConversations` → `_phase3DiscardOrSkip`
 * の順にフェーズ関数を適用するオーケストレーション関数。ファイル名判定と内容判定それぞれの
 * ノイズ確定ファイルを結合して `_phase3DiscardOrSkip` に渡す。分類で残った（ノイズでない）
 * ファイル数は `stats.keep` に加算する。
 *
 * @param entries - 処理対象の `ChatlogEntry` 配列
 * @param stats - 加算対象の処理統計オブジェクト
 * @param options.dryRun - `true` のとき、ノイズ判定確定ファイルを実削除せず `stats.skip` に計上する
 * @param options.concurrency - 同時実行する削除処理の最大並列数。
 */
export const processNoiseFiles = async (
  entries: ChatlogEntry[],
  stats: NoiseFilterStats,
  options: FilterProcessOptions,
): Promise<void> => {
  const { dryRun, concurrency } = options;
  const { discardFiles: filenameDiscardFiles, passEntries } = _phase0ClassifyByFilename(entries);
  const { discardFiles: contentDiscardFiles, keepFiles } = _phase2ClassifyConversations(passEntries);

  stats.keep += keepFiles.length;

  await _phase3DiscardOrSkip(
    [...filenameDiscardFiles, ...contentDiscardFiles],
    stats,
    dryRun,
    concurrency,
  );
};
