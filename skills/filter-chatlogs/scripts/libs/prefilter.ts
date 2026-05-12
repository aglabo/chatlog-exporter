// src: scripts/libs/prefilter.ts
// @(#): 内容ベース事前フィルタ関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import {
  countChars,
  getAssistantTurns,
  getUserTurns,
  hasUserTurn,
  isSingleUserTurn,
  parseConversation,
  renderConversation,
} from '../../../_scripts/libs/chatlogs/conversation-utils.ts';
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { parseFrontmatterEntries } from '../../../_scripts/libs/text/frontmatter-utils.ts';

// ─── internal ───
import { DEFAULT_VALUES } from '../../../_scripts/constants/schema.constants.ts';
import { MAX_BODY_CHARS } from '../constants/common.constants.ts';
import { EXCLUDE_FILENAME_PATTERNS_STR, SYSTEM_TAG_PREFIXES } from '../constants/patterns.constants.ts';
// types
import type { Stats } from '../types/filter.types.ts';

// ─────────────────────────────────────────────
// 事前フィルタ関数
// ─────────────────────────────────────────────

export const isSystemOnlyMessage = (text: string): boolean => {
  const stripped = text.trim();
  return SYSTEM_TAG_PREFIXES.some((prefix) => stripped.startsWith(prefix));
};

export const isExcludedByFilename = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return EXCLUDE_FILENAME_PATTERNS_STR.some((pat) => lower.includes(pat));
};

export const isExcludedByContent = (
  body: string,
  minCharCount = DEFAULT_VALUES.minCharCount as number,
  minAssistantChars = DEFAULT_VALUES.minAssistantChars as number,
): { excluded: boolean; reason: string } => {
  if (body.length < minCharCount) {
    return { excluded: true, reason: `本文が短すぎる (${body.length} < ${minCharCount} 文字)` };
  }

  const _conv = parseConversation(body);

  if (!hasUserTurn(_conv)) {
    return { excluded: true, reason: 'Userターンが存在しない' };
  }

  if (isSingleUserTurn(_conv)) {
    if (isSystemOnlyMessage(getUserTurns(_conv)[0].text)) {
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

export const extractBodyText = (body: string, maxChars = MAX_BODY_CHARS): string =>
  renderConversation(parseConversation(body), maxChars);

/**
 * ファイルリストをファイル名パターンと本文内容で事前フィルタリングし、通過したパスを返す。
 *
 * @param files - フィルタリング対象のファイルパス配列
 * @param minCharCount - 本文の最小文字数（デフォルト: `DEFAULT_VALUES.minCharCount`）
 * @param minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `DEFAULT_VALUES.minAssistantChars`）
 * @param stats - 処理統計オブジェクト（省略可）。指定時は `preSkipped` にスキップ数を代入する。
 * @returns フィルタリングを通過したファイルパスの配列
 */
export const prefilterFiles = async (
  files: string[],
  minCharCount = DEFAULT_VALUES.minCharCount as number,
  minAssistantChars = DEFAULT_VALUES.minAssistantChars as number,
  stats?: Stats,
): Promise<string[]> => {
  const passed: string[] = [];
  let skipped = 0;

  for (const filePath of files) {
    const filename = filePath.split(/[/\\]/).pop()!;

    if (isExcludedByFilename(filename)) {
      logger.info(`  skipped (ファイル名パターン): ${filename}`);
      skipped++;
      continue;
    }

    let text: string;
    try {
      text = await readTextFile(filePath);
    } catch {
      skipped++;
      continue;
    }

    const { content } = parseFrontmatterEntries(text);
    if (!content.trim()) {
      skipped++;
      continue;
    }

    const { excluded, reason } = isExcludedByContent(content, minCharCount, minAssistantChars);
    if (excluded) {
      logger.info(`  skipped (${reason}): ${filename}`);
      skipped++;
      continue;
    }

    const bodyText = extractBodyText(content);
    if (!bodyText.trim()) {
      skipped++;
      continue;
    }

    passed.push(filePath);
  }

  logger.info(`事前フィルタ: 対象=${files.length} 通過=${passed.length} スキップ=${skipped}`);
  if (stats) { stats.preSkipped = skipped; }
  return passed;
};
