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
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { removeFile } from '../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_scripts/constants/config-schema.constants.ts';

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
 * ファイルリストをファイル名パターンで分類する。
 *
 * 除外パターンに一致するファイルは `discardFiles`（`filePath`/`filename`/`reason` を持つ）として確定し、
 * それ以外は本文チェックへ進む `fileList` として返す純粋関数。副作用は一切行わない。
 *
 * @param files - 分類対象のファイルパス配列
 * @returns 通過ファイルパス配列（`fileList`）と、除外確定ファイル情報配列（`discardFiles`）
 */
export const _phase1PartitionByFilename = (
  files: string[],
): { fileList: string[]; discardFiles: DiscardFile[] } => {
  const classified = files.map((filePath) => {
    const filename = getFilename(filePath);
    const reason = checkFilename(filename);
    return { filePath, filename, reason };
  });

  const fileList = classified
    .filter((c) => c.reason === null)
    .map((c) => c.filePath);

  const discardFiles = classified
    .filter((c): c is { filePath: string; filename: string; reason: string } => c.reason !== null)
    .map((c) => ({
      filePath: c.filePath,
      filename: c.filename,
      reason: c.reason,
      decision: FILTER_DECISIONS.DISCARD,
    }));

  return { fileList, discardFiles };
};

/**
 * 1 ファイルを読み込み `ChatlogEntry` を生成する。読み込み・パースに失敗した場合は `null` を返す。
 *
 * ファイル読み込み失敗、および `ChatlogEntry` コンストラクタでのパース失敗（不正な frontmatter 等）の
 * いずれも「読み込み失敗」として扱う。
 *
 * @param filePath - 読み込み対象のファイルパス
 * @returns 読み込み・パースに成功した場合は `ChatlogEntry`、失敗した場合は `null`
 */
const _readEntry = async (filePath: string): Promise<ChatlogEntry | null> => {
  const text = await readTextFile(filePath, { throwFileIoError: false });
  if (text === null) {
    return null;
  }
  try {
    return new ChatlogEntry(text, { filePath });
  } catch {
    return null;
  }
};

/**
 * ファイルリストの本文を並列に読み込み、frontmatter を除いた content を取り出す。
 *
 * 読み込みに失敗したファイルは `filePath` を `readError` に振り分ける。
 *
 * @param survivors - 読み込み対象のファイルパス配列
 * @returns 読み込みに成功したファイル情報（`readOk`）と、読み込みに失敗したファイル情報（`readError`）
 */
export const _phase2ReadSurvivors = async (
  survivors: string[],
): Promise<{ readOk: ChatlogEntry[]; readError: DiscardFile[] }> => {
  const entries = await Promise.all(survivors.map((filePath) => _readEntry(filePath)));

  const readOk = entries.filter((entry): entry is ChatlogEntry => entry !== null);
  const readError = survivors
    .filter((_filePath, i) => entries[i] === null)
    .map((filePath) => ({
      filePath,
      filename: getFilename(filePath),
      reason: '読み込み失敗',
      decision: FILTER_DECISIONS.ERROR,
    }));

  return { readOk, readError };
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
 * @param entry - `_phase2ReadSurvivors` で読み込み済みのファイル情報
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
 * @param readOk - `_phase2ReadSurvivors` で読み込み済みのファイル情報
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
 * `dryRun === true` のときは削除を行わず `stats.skip` に加算してログ出力する（`files` をそのまま返す）。
 * `dryRun === false` のときは `removeFile()` を呼び、成功なら `stats.remove` に加算してログ出力し
 * 戻り値から除く。NotFound（`false`）を返した場合は `stats.error` に加算し、
 * `decision: FILTER_DECISIONS.ERROR` に書き替えたエントリを戻り値に残す
 * （削除できなかったファイルは実在するため、呼び出し元で通過対象に戻せるようにする）。
 *
 * @param files - 削除対象の `DiscardFile` 配列
 * @param dryRun - `true` のとき実削除を行わない
 * @param stats - 加算対象の処理統計オブジェクト
 * @returns 削除できなかった（未実施 or 失敗）ファイルの `DiscardFile` 配列
 */
export const _discardFiles = async (
  files: DiscardFile[],
  dryRun: boolean,
  stats: BaseStats,
): Promise<DiscardFile[]> => {
  const results = await Promise.all(
    files.map(async (entry): Promise<DiscardFile | null> => {
      const { filePath, filename, reason } = entry;
      if (dryRun) {
        logger.info(`  skipped (${reason}): ${filename}`);
        stats.skip++;
        return entry;
      }
      if (!await removeFile(filePath, { throwFileIoError: false })) {
        logger.warn(`  cant removed (${reason}): ${filename}`);
        stats.error++;
        return { ...entry, decision: FILTER_DECISIONS.ERROR };
      }
      stats.remove++;
      logger.info(`  removed (${reason}): ${filename}`);
      return null;
    }),
  );
  return results.filter((entry): entry is DiscardFile => entry !== null);
};

/**
 * ファイルリストをファイル名パターンと本文内容で事前フィルタリングし、通過したパスを返す。
 *
 * @param files - フィルタリング対象のファイルパス配列
 * @param options - `prefilterFiles` のオプション
 * @param options.minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）
 * @param options.minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）
 * @param options.stats - 処理統計オブジェクト。ファイル名パターン除外・内容除外の実削除数を `remove` に、
 *   dry-run 時のスキップ数を `skip` に、読み込み失敗数を `error` に加算する。
 * @param options.dryRun - `true` のとき、削除対象ファイルを実削除せず `stats.skip` に計上する（デフォルト: `false`）
 * @returns フィルタリングを通過したファイルパスの配列
 */
export const prefilterFiles = async (
  files: string[],
  options: PrefilterFilesOptions,
): Promise<string[]> => {
  const {
    minCharCount = DEFAULT_CONFIG_VALUES.minCharCount as number,
    minAssistantChars = DEFAULT_CONFIG_VALUES.minAssistantChars as number,
    stats,
    dryRun = false,
  } = options;

  const { fileList, discardFiles } = _phase1PartitionByFilename(files);

  const byRead = await _phase2ReadSurvivors(fileList);
  const byContent = _phase3PartitionByContent(byRead.readOk, minCharCount, minAssistantChars);

  const toDelete = [...discardFiles, ...byContent.results];
  stats.error += byRead.readError.length;

  const notDeleted = await _discardFiles(toDelete, dryRun, stats);

  const notDeletedPaths = new Set(notDeleted.map((entry) => entry.filePath));
  const deletedPaths = new Set(
    toDelete.map((entry) => entry.filePath).filter((filePath) => !notDeletedPaths.has(filePath)),
  );
  const passed = files.filter((filePath) => !deletedPaths.has(filePath));

  if (!dryRun) {
    logger.info(
      `事前フィルタ: 対象=${files.length} 通過=${passed.length} remove=${stats.remove} skip=${stats.skip} error=${stats.error}`,
    );
  }
  return passed;
};
