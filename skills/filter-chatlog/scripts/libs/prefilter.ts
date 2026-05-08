// src: scripts/libs/prefilter.ts
// @(#): 内容ベース事前フィルタ関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { parseFrontmatterEntries } from '../../../_scripts/libs/text/frontmatter-utils.ts';
import { parseConversation } from '../../../_scripts/libs/text/markdown-utils.ts';

// ─── internal ───
import { MAX_BODY_CHARS, MIN_ASSISTANT_CHARS_CONTENT, MIN_CHAR_COUNT } from '../constants/filter.constants.ts';
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
  minCharCount = MIN_CHAR_COUNT,
  minAssistantChars = MIN_ASSISTANT_CHARS_CONTENT,
): { excluded: boolean; reason: string } => {
  if (body.length < minCharCount) {
    return { excluded: true, reason: `本文が短すぎる (${body.length} < ${minCharCount} 文字)` };
  }

  const turns = parseConversation(body);
  const userTurns = turns.filter((t) => t.role === 'user');
  const assistantTurns = turns.filter((t) => t.role === 'assistant');

  if (userTurns.length === 0) {
    return { excluded: true, reason: 'Userターンが存在しない' };
  }

  if (userTurns.length === 1) {
    if (isSystemOnlyMessage(userTurns[0].text)) {
      return { excluded: true, reason: 'Userメッセージがシステム/コマンドタグのみ' };
    }
    const totalAssistantChars = assistantTurns.reduce((sum, t) => sum + t.text.length, 0);
    if (totalAssistantChars < minAssistantChars) {
      return {
        excluded: true,
        reason: `Assistantの応答が短すぎる (${totalAssistantChars} < ${minAssistantChars} 文字)`,
      };
    }
  }

  return { excluded: false, reason: '' };
};

export const extractBodyText = (body: string, maxChars = MAX_BODY_CHARS): string => {
  const turns = parseConversation(body);
  const parts = turns.map((t) => {
    const role = t.role === 'user' ? 'User' : 'Assistant';
    return `### ${role}\n${t.text}`;
  });
  return parts.join('\n\n').slice(0, maxChars);
};

/**
 * ファイルリストをファイル名パターンと本文内容で事前フィルタリングし、通過したパスを返す。
 *
 * @param files - フィルタリング対象のファイルパス配列
 * @param minCharCount - 本文の最小文字数（デフォルト: `MIN_CHAR_COUNT`）
 * @param minAssistantChars - User ターンが 1 件のとき、Assistant 応答の最小文字数（デフォルト: `MIN_ASSISTANT_CHARS_CONTENT`）
 * @param stats - 処理統計オブジェクト（省略可）。指定時は `preSkipped` にスキップ数を代入する。
 * @returns フィルタリングを通過したファイルパスの配列
 */
export const prefilterFiles = async (
  files: string[],
  minCharCount = MIN_CHAR_COUNT,
  minAssistantChars = MIN_ASSISTANT_CHARS_CONTENT,
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
