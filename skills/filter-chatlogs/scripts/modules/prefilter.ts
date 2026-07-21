// src: scripts/modules/prefilter.ts
// @(#): 内容ベース事前フィルタ関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:ignore conv

// ─── shared ───
// functions
import {
  countChars,
  getAssistantTurns,
  getUserTurns,
  hasUserTurn,
  isSingleUserTurn,
  parseConversation,
} from '../../../_scripts/libs/chatlogs/conversation-utils.ts';
import { removeFile } from '../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_scripts/constants/config-schema.constants.ts';
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';

// ─── internal ───
// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// functions
import { checkFilename } from '../libs/classify-file.ts';
import { extractConversation } from '../libs/common-utils.ts';
// constants
import { SYSTEM_TAG_PREFIXES } from '../constants/patterns.constants.ts';
import { FILTER_DECISIONS } from '../types/filter-decision.const.types.ts';
// types
import type { DiscardFile, PrefilterFilesOptions } from '../types/filter.types.ts';
import type { BaseStats } from '../types/stats.types.ts';

// ─────────────────────────────────────────────
// 事前フィルタ関数
// ─────────────────────────────────────────────

/**
 * テキストがシステム/コマンドタグのみで構成されているかどうかを判定する。
 *
 * `SYSTEM_TAG_PREFIXES` に登録されたプレフィックスで始まる場合に `true` を返す。
 *
 * @param text - 判定対象のテキスト
 * @returns システム/コマンドタグのみなら `true`
 */
export const isSystemOnlyMessage = (text: string): boolean => {
  const stripped = text.trim();
  return SYSTEM_TAG_PREFIXES.some((prefix) => stripped.startsWith(prefix));
};

/**
 * ファイル名がノイズ判定パターンに一致するかどうかを判定する。
 *
 * `checkFilename` が非 `null` を返した場合に除外対象と見なす。
 *
 * @param filename - 判定対象のファイル名（パスではなくファイル名部分）
 * @returns 除外対象なら `true`
 */
export const isExcludedByFilename = (filename: string): boolean => checkFilename(filename) !== null;

/**
 * 本文テキストをファイル内容チェックで除外するかどうかを判定し、理由を返す。
 *
 * 以下の順に評価し、いずれかに該当すれば除外:
 * 1. 本文が `minCharCount` 文字未満
 * 2. User ターンが存在しない
 * 3. User ターンが 1 件のとき、User メッセージがシステム/コマンドタグのみ
 * 4. User ターンが 1 件のとき、Assistant 応答の合計文字数が `minAssistantChars` 未満
 *
 * @param body - 判定対象の本文テキスト（frontmatter を除いたコンテンツ部分）
 * @param minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）
 * @param minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）
 * @returns `excluded: true` の場合は除外対象。`reason` に除外理由を格納する。
 */
export const isExcludedByContent = (
  body: string,
  minCharCount = DEFAULT_CONFIG_VALUES.minCharCount as number,
  minAssistantChars = DEFAULT_CONFIG_VALUES.minAssistantChars as number,
): { excluded: boolean; reason: string } => {
  if (body.length < minCharCount) {
    return { excluded: true, reason: `本文が短すぎる (${body.length} < ${minCharCount} 文字)` };
  }

  const _conv = parseConversation(body);

  if (!hasUserTurn(_conv)) {
    return { excluded: true, reason: 'Userターンが存在しない' };
  }

  if (isSingleUserTurn(_conv)) {
    if (isSystemOnlyMessage(getUserTurns(_conv)[0].content)) {
      return { excluded: true, reason: 'Userメッセージがシステム/コマンドタグのみ' };
    }
    const totalAssistantChars = countChars(getAssistantTurns(_conv));
    if (totalAssistantChars < minAssistantChars) {
      return {
        excluded: true,
        reason: `Assistantの応答が短すぎる (${totalAssistantChars} < ${minAssistantChars} 文字)`,
      };
    }
  }

  return { excluded: false, reason: '' };
};

/**
 * エントリリストをファイル名パターンで分類する。
 *
 * 除外パターンに一致するエントリは `discardFiles`（`filePath`/`filename`/`reason` を持つ）として確定し、
 * それ以外は本文チェックへ進む `fileList` として返す純粋関数。副作用は一切行わない。
 *
 * @param entries - 分類対象の `ChatlogEntry` 配列
 * @returns 通過エントリ配列（`fileList`）と、除外確定ファイル情報配列（`discardFiles`）
 */
export const _phase1PartitionByFilename = (
  entries: ChatlogEntry[],
): { fileList: ChatlogEntry[]; discardFiles: DiscardFile[] } => {
  const classified = entries.map((entry) => ({
    entry,
    filePath: entry.filePath as string,
    filename: entry.filename as string,
    reason: checkFilename(entry.filename as string),
  }));

  const fileList = classified
    .filter((c) => c.reason === null)
    .map((c) => c.entry);

  const discardFiles = classified
    .filter((c): c is typeof c & { reason: string } => c.reason !== null)
    .map((c) => ({
      filePath: c.filePath,
      filename: c.filename,
      reason: c.reason,
      decision: FILTER_DECISIONS.DISCARD,
    }));

  return { fileList, discardFiles };
};

/** `_classifyEntryByContent` の分類結果。除外確定（`excluded`）か通過（`survivor`）のいずれかを表す。 */
type _ContentClassification =
  | { kind: 'excluded'; result: DiscardFile }
  | { kind: 'survivor'; entry: ChatlogEntry };

/**
 * 1 ファイルの本文を内容チェックで分類する。
 *
 * 本文が空・内容が短すぎる・会話本文が空のいずれかに該当する場合は
 * `excluded-content` の分類結果を、それ以外は入力エントリそのものを返す純粋関数。
 *
 * @param entry - 読み込み済みの `ChatlogEntry`
 * @param minCharCount - 本文の最小文字数
 * @param minAssistantChars - User ターン 1 件のときの Assistant 応答最小文字数
 * @returns 除外確定結果、または通過ファイルのエントリ
 */
const _classifyEntryByContent = (
  entry: ChatlogEntry,
  minCharCount: number,
  minAssistantChars: number,
): _ContentClassification => {
  const filePath = entry.filePath as string;
  const filename = entry.filename as string;
  const { content } = entry;

  if (!content.trim()) {
    return {
      kind: 'excluded',
      result: { filePath, filename, reason: '本文が空', decision: FILTER_DECISIONS.DISCARD },
    };
  }

  const { excluded, reason } = isExcludedByContent(content, minCharCount, minAssistantChars);
  if (excluded) {
    return { kind: 'excluded', result: { filePath, filename, reason, decision: FILTER_DECISIONS.DISCARD } };
  }

  const bodyText = extractConversation(content);
  if (!bodyText.trim()) {
    return {
      kind: 'excluded',
      result: { filePath, filename, reason: '会話本文が空', decision: FILTER_DECISIONS.DISCARD },
    };
  }

  return { kind: 'survivor', entry };
};

/**
 * 読み込み済みファイルの本文を内容チェックで分類する。
 *
 * 本文が空・内容が短すぎる・会話本文が空のいずれかに該当するファイルは
 * `excluded-content` として確定し、通過したファイルのみ `survivors` に含める。
 *
 * @param readOk - 読み込み済みの `ChatlogEntry` 配列
 * @param minCharCount - 本文の最小文字数
 * @param minAssistantChars - User ターン 1 件のときの Assistant 応答最小文字数
 * @returns 通過ファイル情報（`survivors`）と、この段階で確定した分類結果（`results`）
 */
export const _phase3PartitionByContent = (
  readOk: ChatlogEntry[],
  minCharCount: number,
  minAssistantChars: number,
): { survivors: ChatlogEntry[]; results: DiscardFile[] } => {
  const classified = readOk.map((entry) => _classifyEntryByContent(entry, minCharCount, minAssistantChars));

  const results = classified
    .filter((c): c is { kind: 'excluded'; result: DiscardFile } => c.kind === 'excluded')
    .map((c) => c.result);

  const survivors = classified
    .filter((c): c is { kind: 'survivor'; entry: ChatlogEntry } => c.kind === 'survivor')
    .map((c) => c.entry);

  return { survivors, results };
};

/**
 * 削除確定ファイルをバッチで削除し、stats を加算する。
 *
 * `decision === FILTER_DECISIONS.DISCARD` のエントリのみを削除処理の対象とする。
 * それ以外（`FILTER_DECISIONS.ERROR` 等）が誤って渡された場合は削除を試みず、
 * そのまま戻り値に残す（呼び出し元が `toDelete` の組み立てを誤った場合の誤削除防止ガード）。
 *
 * `dryRun === true` のときは削除を行わず `stats.skip` に加算してログ出力する（`files` をそのまま返す）。
 * `dryRun === false` のときは `removeFile()` を呼び、成功なら `stats.remove` に加算してログ出力し
 * 戻り値から除く。NotFound（`false`）を返した場合は `stats.error` に加算し、
 * `decision: FILTER_DECISIONS.ERROR` に書き替えたエントリを戻り値に残す
 * （削除できなかったファイルは実在するため、呼び出し元で通過対象に戻せるようにする）。
 *
 * @param files - 削除対象の `DiscardFile` 配列
 * @param dryRun - `true` のとき実削除を行わない
 * @param stats - 加算対象の処理統計オブジェクト
 * @param concurrency - 同時実行する削除処理の最大並列数。
 * @returns 削除できなかった（未実施 or 失敗）ファイル、および非 DISCARD エントリの `DiscardFile` 配列
 */
export const _discardFiles = async (
  files: DiscardFile[],
  dryRun: boolean,
  stats: BaseStats,
  concurrency: number,
): Promise<DiscardFile[]> => {
  const toDiscard = files.filter((entry) => entry.decision === FILTER_DECISIONS.DISCARD);
  const nonDiscard = files.filter((entry) => entry.decision !== FILTER_DECISIONS.DISCARD);

  const results = await runConcurrent(
    toDiscard,
    async (entry): Promise<DiscardFile | null> => {
      const { filePath, filename, reason } = entry;
      if (dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}skipped (${reason}): ${filename}`);
        stats.skip++;
        return entry;
      }
      if (!await removeFile(filePath, { throwFileIoError: false })) {
        stats.error++;
        return { ...entry, decision: FILTER_DECISIONS.ERROR };
      }
      stats.remove++;
      logger.info(`${LOGGER_TEXT.INDENT}removed (${reason}): ${filename}`);
      return null;
    },
    concurrency,
  );
  return [...results.filter((entry): entry is DiscardFile => entry !== null), ...nonDiscard];
};

/**
 * 読み込み済みエントリをファイル名パターンと本文内容で事前フィルタリングし、通過したエントリを返す。
 *
 * @param entries - フィルタリング対象の `ChatlogEntry` 配列（読み込み済み）
 * @param options - `prefilterFiles` のオプション
 * @param options.minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）
 * @param options.minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）
 * @param options.stats - 処理統計オブジェクト。ファイル名パターン除外・内容除外の実削除数を `remove` に、
 *   dry-run 時のスキップ数を `skip` に加算する。
 * @param options.dryRun - `true` のとき、削除対象ファイルを実削除せず `stats.skip` に計上する（デフォルト: `false`）
 * @param options.concurrency - 同時実行する削除処理の最大並列数。
 * @returns フィルタリングを通過した `ChatlogEntry` 配列
 */
export const prefilterFiles = async (
  entries: ChatlogEntry[],
  options: PrefilterFilesOptions,
): Promise<ChatlogEntry[]> => {
  const {
    minCharCount = DEFAULT_CONFIG_VALUES.minCharCount as number,
    minAssistantChars = DEFAULT_CONFIG_VALUES.minAssistantChars as number,
    stats,
    dryRun = false,
    concurrency,
  } = options;

  const { fileList, discardFiles } = _phase1PartitionByFilename(entries);
  const byContent = _phase3PartitionByContent(fileList, minCharCount, minAssistantChars);

  const toDelete = [...discardFiles, ...byContent.results];

  const notDeleted = await _discardFiles(toDelete, dryRun, stats, concurrency);

  const errorPaths = new Set(
    notDeleted.filter((entry) => entry.decision === FILTER_DECISIONS.ERROR).map((entry) => entry.filePath),
  );
  const excludedPaths = new Set(
    toDelete.map((entry) => entry.filePath).filter((filePath) => !errorPaths.has(filePath)),
  );
  const passed = entries.filter((entry) => !excludedPaths.has(entry.filePath as string));

  if (!dryRun) {
    logger.info(
      `事前フィルタ: 対象=${entries.length} 通過=${passed.length} remove=${stats.remove} skip=${stats.skip} error=${stats.error}`,
    );
  }
  return passed;
};
