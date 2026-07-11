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
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { parseFrontmatterEntries } from '../../../_scripts/libs/text/frontmatter-utils.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_scripts/constants/config-schema.constants.ts';

// ─── internal ───
// functions
import { checkFilename } from '../libs/classify-file.ts';
import { extractConversation } from '../libs/common-utils.ts';
// constants
import { SYSTEM_TAG_PREFIXES } from '../constants/patterns.constants.ts';
// types
import type { PrefilterFilesOptions } from '../types/filter.types.ts';

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
 * ファイルリストをファイル名パターンと本文内容で事前フィルタリングし、通過したパスを返す。
 *
 * @param files - フィルタリング対象のファイルパス配列
 * @param options - `prefilterFiles` のオプション
 * @param options.minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minCharCount`）
 * @param options.minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_CONFIG_VALUES.minAssistantChars`）
 * @param options.stats - 処理統計オブジェクト。事前段階での KEEP 確定数を `keep` に、読み込み失敗数を `error` に加算する。
 * @param options.dryRun - `true` のとき、スキップ理由・サマリのログ出力を抑制する（デフォルト: `false`）
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

  const passed: string[] = [];

  for (const filePath of files) {
    const filename = getFilename(filePath);

    if (isExcludedByFilename(filename)) {
      if (!dryRun) { logger.info(`  skipped (ファイル名パターン): ${filename}`); }
      stats.keep++;
      continue;
    }

    let text: string;
    try {
      text = await readTextFile(filePath);
    } catch {
      stats.error++;
      continue;
    }

    const { content } = parseFrontmatterEntries(text);
    if (!content.trim()) {
      stats.keep++;
      continue;
    }

    const { excluded, reason } = isExcludedByContent(content, minCharCount, minAssistantChars);
    if (excluded) {
      if (!dryRun) { logger.info(`  skipped (${reason}): ${filename}`); }
      stats.keep++;
      continue;
    }

    const bodyText = extractConversation(content);
    if (!bodyText.trim()) {
      stats.keep++;
      continue;
    }

    passed.push(filePath);
  }

  if (!dryRun) {
    logger.info(`事前フィルタ: 対象=${files.length} 通過=${passed.length} keep=${stats.keep}`);
  }
  return passed;
};
