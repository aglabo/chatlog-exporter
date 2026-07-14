// src: scripts/modules/noise-filter/process-noise-files.ts
// @(#): ノイズファイルのリスト処理（分類・削除・dry-run）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_CONCURRENCY } from '../../../../_scripts/constants/defaults.constants.ts';
// types
import type { Conversation } from '../../../../_scripts/types/conversation.types.ts';

// ─── internal ───
// types
import type { NoiseDiscardFile } from '../../types/noise-filter.types.ts';
import type { NoiseFilterStats } from '../../types/stats.types.ts';
// functions
import { classifyConversation, classifyFile, readConversation } from '../../libs/classify-file.ts';
// constants
import { FILTER_DECISIONS } from '../../types/filter-decision.const.types.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// ファイルリスト処理
// ─────────────────────────────────────────────

/** `_phase1ReadFiles` の読み込み成功エントリ。 */
interface _ReadFileEntry {
  filePath: string;
  filename: string;
  conversation: Conversation;
}

/**
 * ファイルパス配列を `classifyFile` でファイル名パターン判定し、ノイズ確定/通過に分類する。
 *
 * ファイル名パターンに一致したファイルは `NoiseDiscardFile`（`decision: FILTER_DECISIONS.DISCARD`）
 * として `discardFiles` に、一致しなかったファイルは `filePath` のみ `passFiles` に振り分ける純粋関数。
 *
 * @param files - 判定対象のファイルパス配列
 * @returns ファイル名ノイズ判定確定ファイル（`discardFiles`）と、通過ファイルパス（`passFiles`）
 */
export const _phase0ClassifyByFilename = (
  files: string[],
): { discardFiles: NoiseDiscardFile[]; passFiles: string[] } => {
  const classified = files.map((filePath) => ({
    filePath,
    discard: classifyFile({ filePath, filename: getFilename(filePath) }),
  }));

  const discardFiles = classified
    .filter((c): c is { filePath: string; discard: NoiseDiscardFile } => c.discard !== null)
    .map((c) => c.discard);

  const passFiles = classified
    .filter((c) => c.discard === null)
    .map((c) => c.filePath);

  return { discardFiles, passFiles };
};

/**
 * ファイルリストを並列に読み込み、会話ターン配列にパースしたうえで成功/失敗エントリに振り分ける。
 *
 * 読み込みに失敗したファイル、および `readConversation` がパース失敗で `ChatlogError` を
 * throw したファイルは、実際のエラーメッセージを `reason` に持つ
 * `NoiseDiscardFile`（`decision: FILTER_DECISIONS.ERROR`）として `readError` に振り分ける。
 * `ChatlogError` 以外の予期しない例外は catch せずそのまま伝播する。
 *
 * @param files - 読み込み対象のファイルパス配列
 * @returns 読み込み・パースに成功したファイル情報（`readOk`）と、読み込み・パースに失敗したファイル情報（`readError`）
 */
export const _phase1ReadFiles = async (
  files: string[],
): Promise<{ readOk: _ReadFileEntry[]; readError: NoiseDiscardFile[] }> => {
  const results = await runConcurrent(
    files,
    async (filePath): Promise<
      { kind: 'ok'; entry: _ReadFileEntry } | { kind: 'error'; result: NoiseDiscardFile }
    > => {
      const filename = getFilename(filePath);
      const text = await readTextFile(filePath, { throwFileIoError: false });
      if (text instanceof Error) {
        return {
          kind: 'error',
          result: { filePath, filename, reason: text.message, decision: FILTER_DECISIONS.ERROR },
        };
      }
      try {
        return { kind: 'ok', entry: { filePath, filename, conversation: readConversation(text) } };
      } catch (e) {
        if (e instanceof ChatlogError) {
          return {
            kind: 'error',
            result: { filePath, filename, reason: e.message, decision: FILTER_DECISIONS.ERROR },
          };
        }
        // ChatlogError は想定内のパース失敗として readError に吸収する。OOM 等の想定外の
        // ランタイム例外は握りつぶさずそのまま伝播させる（fail-first）。
        throw e;
      }
    },
    DEFAULT_CONCURRENCY,
  );

  const readOk = results
    .filter((r): r is { kind: 'ok'; entry: _ReadFileEntry } => r.kind === 'ok')
    .map((r) => r.entry);

  const readError = results
    .filter((r): r is { kind: 'error'; result: NoiseDiscardFile } => r.kind === 'error')
    .map((r) => r.result);

  return { readOk, readError };
};

/**
 * 読み込み済み会話を `classifyConversation` の判定でノイズ確定/keep に分類する。
 *
 * 会話内容がノイズ判定された（`reason !== null`）ファイルは `NoiseDiscardFile`
 * （`decision: FILTER_DECISIONS.DISCARD`、`reason` は `classifyConversation` の判定理由）として
 * `discardFiles` に、それ以外は `filePath` のみ `keepFiles` に振り分ける純粋関数。
 *
 * @param entries - `_phase1ReadFiles` で読み込み・パース済みのファイル情報
 * @returns ノイズ判定確定ファイル（`discardFiles`）と、通過ファイルパス（`keepFiles`）
 */
export const _phase2ClassifyConversations = (
  entries: _ReadFileEntry[],
): { discardFiles: NoiseDiscardFile[]; keepFiles: string[] } => {
  const classified = entries.map((entry) => ({
    entry,
    reason: classifyConversation(entry.conversation),
  }));

  const discardFiles = classified
    .filter((c): c is { entry: _ReadFileEntry; reason: string } => c.reason !== null)
    .map((c) => ({
      filePath: c.entry.filePath,
      filename: c.entry.filename,
      reason: c.reason,
      decision: FILTER_DECISIONS.DISCARD,
    }));

  const keepFiles = classified
    .filter((c) => c.reason === null)
    .map((c) => c.entry.filePath);

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
 */
export const _phase3DiscardOrSkip = async (
  discardFiles: NoiseDiscardFile[],
  stats: NoiseFilterStats,
  dryRun: boolean,
): Promise<void> => {
  await Promise.all(
    discardFiles.map(async ({ filePath, reason }) => {
      if (dryRun) {
        logger.info(`<<dry-run>> skip: ${filePath} (${reason})`);
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
    }),
  );
};

/**
 * ファイルリストを分類・読み込み・分類し、ノイズ判定確定ファイルを削除（または dry-run 出力）する。
 *
 * `_phase0ClassifyByFilename` → `_phase1ReadFiles` → `_phase2ClassifyConversations` → `_phase3DiscardOrSkip`
 * の順にフェーズ関数を適用するオーケストレーション関数。ファイル名判定と内容判定それぞれの
 * ノイズ確定ファイルを結合して `_phase3DiscardOrSkip` に渡す。読み込み失敗分は `logger.error` に
 * まとめて出力したうえで `stats.error` に、分類で残った（ノイズでない）ファイル数は `stats.keep` に加算する。
 *
 * @param files - 処理対象のファイルパス配列
 * @param stats - 加算対象の処理統計オブジェクト
 * @param options.dryRun - `true` のとき、ノイズ判定確定ファイルを実削除せず `stats.skip` に計上する
 */
export const processNoiseFiles = async (
  files: string[],
  stats: NoiseFilterStats,
  options: { dryRun: boolean },
): Promise<void> => {
  const { discardFiles: filenameDiscardFiles, passFiles } = _phase0ClassifyByFilename(files);
  const { readOk, readError } = await _phase1ReadFiles(passFiles);
  const { discardFiles: contentDiscardFiles, keepFiles } = _phase2ClassifyConversations(readOk);

  readError.forEach(({ filename, reason }) => {
    logger.error(`  error (${filename}): ${reason}`);
  });

  stats.error += readError.length;
  stats.keep += keepFiles.length;

  await _phase3DiscardOrSkip([...filenameDiscardFiles, ...contentDiscardFiles], stats, options.dryRun);
};
