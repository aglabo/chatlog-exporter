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
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// functions
import { checkFilename } from '../libs/classify-file.ts';
import { extractConversation } from '../libs/common-utils.ts';
// constants
import { SYSTEM_TAG_PREFIXES } from '../constants/patterns.constants.ts';
import { FILTER_DECISIONS } from '../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../types/cache.types.ts';
import type { PrefilterFilesOptions } from '../types/filter.types.ts';
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

/** 分類結果の種別。stats 加算先・ログ出力・passed 抽出をこの値だけで判別する。 */
type _PrefilterOutcome =
  | 'read-error'
  | 'excluded-content'
  | 'cache-keep'
  | 'cache-discard-removed'
  | 'cache-discard-error'
  | 'passed';

/** 各ステージ関数の戻り値。1 ファイルにつき 1 件、stats 加算先が一意に定まる分類結果。 */
interface _ClassifyResult {
  filePath: string;
  filename: string;
  outcome: _PrefilterOutcome;
  /** スキップ理由（`excluded-content` のときのみ意味を持つ）。 */
  reason?: string;
}

/**
 * ファイルリストをファイル名パターンで分類する。
 *
 * 除外パターンに一致するファイルは `discarded` として確定し、
 * それ以外は本文チェックへ進む `survivors` として返す純粋関数。
 * cache 書き込み・実削除・stats 加算などの副作用は一切行わない。
 *
 * @param files - 分類対象のファイルパス配列
 * @returns 通過ファイルパス配列（`survivors`）と、除外確定ファイルパス配列（`discarded`）
 */
export const _phase1_1PartitionByFilename = (files: string[]): { survivors: string[]; discarded: string[] } => {
  const discarded = files.filter((filePath) => isExcludedByFilename(getFilename(filePath)));
  const survivors = files.filter((filePath) => !isExcludedByFilename(getFilename(filePath)));
  return { survivors, discarded };
};

/**
 * ファイル名パターンで除外確定したファイルを、cache 書き込み・実削除・stats 加算まで一括処理する。
 *
 * cache 指定時は dry-run でも DISCARD decision を書き込む。実削除は `dryRun === false` のときのみ行う。
 * `dryRun === true` のときは削除せず `stats.remove` に加算する（would-remove）。
 * `removeFile()` が NotFound（`false`）を返した場合は `stats.remove` ではなく `stats.error` に加算する。
 *
 * @param discarded - `_phase1_1PartitionByFilename` が返したファイル名除外確定ファイルパス配列
 * @param cache - DISCARD decision を書き込むキャッシュ（未指定なら書き込みしない）
 * @param dryRun - `true` のとき実削除・ログ出力を行わない
 * @param discardThreshold - cache に書き込む DISCARD decision の confidence 値
 */
export const _phase1_2DiscardByFilename = async (
  discarded: string[],
  cache: ChatlogCache<CLEResult> | undefined,
  dryRun: boolean,
  discardThreshold: number,
  stats: BaseStats,
): Promise<void> => {
  await Promise.all(
    discarded.map(async (filePath) => {
      const filename = getFilename(filePath);
      if (cache) {
        await cache.write(filePath, {
          decision: FILTER_DECISIONS.DISCARD,
          confidence: discardThreshold,
          reason: checkFilename(filename) ?? '',
        });
      }

      if (dryRun) {
        stats.remove++;
        return;
      }

      if (await removeFile(filePath)) {
        stats.remove++;
        logger.info(`  skipped (ファイル名パターン): ${filename}`);
      } else {
        stats.error++;
      }
    }),
  );
};

/**
 * ファイルリストの本文を並列に読み込み、frontmatter を除いた content を取り出す。
 *
 * 読み込みに失敗したファイルは `read-error` として確定する（cache 指定時は ERROR decision を書き込む）。
 *
 * @param survivors - 読み込み対象のファイルパス配列
 * @param cache - 読み込み失敗時に ERROR decision を書き込むキャッシュ（未指定なら書き込みしない）
 * @returns 読み込みに成功したファイル情報（`readOk`）と、読み込み失敗として確定した分類結果（`results`）
 */
export const _phase2ReadSurvivors = async (
  survivors: string[],
  cache: ChatlogCache<CLEResult> | undefined,
): Promise<{ readOk: ChatlogEntry[]; results: _ClassifyResult[] }> => {
  const entries = await Promise.all(
    survivors.map(
      async (filePath): Promise<{ ok: true; entry: ChatlogEntry } | { ok: false; result: _ClassifyResult }> => {
        const filename = getFilename(filePath);
        try {
          const text = await readTextFile(filePath);
          return { ok: true, entry: new ChatlogEntry(text, { filePath }) };
        } catch {
          if (cache) {
            await cache.write(filePath, { decision: FILTER_DECISIONS.ERROR, confidence: 0, reason: '読み込み失敗' });
          }
          return { ok: false, result: { filePath, filename, outcome: 'read-error' } };
        }
      },
    ),
  );

  const readOk = entries.filter((entry) => entry.ok).map((entry) => entry.entry);
  const results = entries.filter((entry) => !entry.ok).map((entry) => entry.result);

  return { readOk, results };
};

/** `_phase3PartitionByContent` を通過したファイルの会話本文情報。 */
interface _ConversationEntry {
  filePath: string;
  filename: string;
  bodyText: string;
}

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
): { survivors: _ConversationEntry[]; results: _ClassifyResult[] } => {
  const results: _ClassifyResult[] = [];
  const survivors: _ConversationEntry[] = [];

  readOk.forEach((entry) => {
    const filePath = entry.filePath as string;
    const filename = entry.filename as string;
    const { content } = entry;

    if (!content.trim()) {
      results.push({ filePath, filename, outcome: 'excluded-content', reason: '本文が空' });
      return;
    }

    const { excluded, reason } = isExcludedByContent(content, minCharCount, minAssistantChars);
    if (excluded) {
      results.push({ filePath, filename, outcome: 'excluded-content', reason });
      return;
    }

    const bodyText = extractConversation(content);
    if (!bodyText.trim()) {
      results.push({ filePath, filename, outcome: 'excluded-content', reason: '会話本文が空' });
      return;
    }

    survivors.push({ filePath, filename, bodyText });
  });

  return { survivors, results };
};

/**
 * 内容チェックを通過したファイルをキャッシュ判定で分類する。
 *
 * cache 未指定の場合は全件 `passed` として確定する。
 * cache 指定時は既存判定（decision !== ERROR）があれば AI 呼び出しをスキップし、
 * DISCARD かつ confidence が閾値以上ならファイル削除（dry-run 時は削除しない）、
 * それ以外は KEEP として確定する。
 *
 * @param survivors - `_phase3PartitionByContent` を通過したファイル情報
 * @param cache - ファイル単位の判定結果キャッシュ
 * @param dryRun - `true` のとき DISCARD 確定時もファイルを削除しない
 * @param discardThreshold - DISCARD 判定に必要な最低信頼度スコア
 * @returns この段階で確定した分類結果
 */
export const _phase4ResolveCache = async (
  survivors: _ConversationEntry[],
  cache: ChatlogCache<CLEResult> | undefined,
  dryRun: boolean,
  discardThreshold: number,
): Promise<_ClassifyResult[]> => {
  if (!cache) {
    return survivors.map(({ filePath, filename }) => ({ filePath, filename, outcome: 'passed' as const }));
  }

  return await Promise.all(
    survivors.map(async ({ filePath, filename }): Promise<_ClassifyResult> => {
      const cached = cache.read(filePath);
      if (cached.decision !== undefined && cached.decision !== FILTER_DECISIONS.ERROR) {
        if (cached.decision === FILTER_DECISIONS.DISCARD && (cached.confidence ?? 0) >= discardThreshold) {
          if (dryRun || await removeFile(filePath)) {
            return { filePath, filename, outcome: 'cache-discard-removed' };
          }
          return { filePath, filename, outcome: 'cache-discard-error' };
        }
        return { filePath, filename, outcome: 'cache-keep' };
      }
      return { filePath, filename, outcome: 'passed' };
    }),
  );
};

/** `_ClassifyResult.outcome` から `BaseStats` の加算先フィールド名への対応表。 */
const _OUTCOME_STATS_FIELD: Partial<Record<_PrefilterOutcome, 'keep' | 'remove' | 'error'>> = {
  'read-error': 'error',
  'excluded-content': 'keep',
  'cache-keep': 'keep',
  'cache-discard-removed': 'remove',
  'cache-discard-error': 'error',
};

/**
 * ファイルリストをファイル名パターンと本文内容で事前フィルタリングし、通過したパスを返す。
 *
 * @param files - フィルタリング対象のファイルパス配列
 * @param options - `prefilterFiles` のオプション
 * @param options.minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）
 * @param options.minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）
 * @param options.stats - 処理統計オブジェクト。ファイル名パターン除外の実削除数を `remove` に、
 *   事前段階での KEEP 確定数を `keep` に、読み込み失敗数を `error` に加算する。
 * @param options.dryRun - `true` のとき、スキップ理由・サマリのログ出力を抑制する（デフォルト: `false`）
 * @param options.cache - ファイル単位の判定結果キャッシュ。指定時は既存判定があれば AI 呼び出しをスキップし、
 *   `decision`/`confidence` からその場で KEEP/DISCARD を再導出する（dry-run 時は削除を行わない）。
 * @param options.discardThreshold - DISCARD 判定に必要な最低信頼度スコア。キャッシュヒット時の再判定に使用する。
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
    cache,
    discardThreshold = DEFAULT_CONFIG_VALUES.discardThreshold as number,
  } = options;

  const byFilename = _phase1_1PartitionByFilename(files);
  await _phase1_2DiscardByFilename(byFilename.discarded, cache, dryRun, discardThreshold, stats);

  const byRead = await _phase2ReadSurvivors(byFilename.survivors, cache);
  const byContent = _phase3PartitionByContent(byRead.readOk, minCharCount, minAssistantChars);
  const byCache = await _phase4ResolveCache(byContent.survivors, cache, dryRun, discardThreshold);

  const _results = [...byRead.results, ...byContent.results, ...byCache];

  _results.forEach((result) => {
    const statsField = _OUTCOME_STATS_FIELD[result.outcome];
    if (statsField) { stats[statsField]++; }

    if (dryRun) { return; }
    if (result.outcome === 'excluded-content') {
      logger.info(`  skipped (${result.reason}): ${result.filename}`);
    }
  });

  const passed = _results.filter((result) => result.outcome === 'passed').map((result) => result.filePath);

  if (!dryRun) {
    logger.info(`事前フィルタ: 対象=${files.length} 通過=${passed.length} keep=${stats.keep}`);
  }
  return passed;
};
