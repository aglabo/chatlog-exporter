// src: scripts/libs/batch-prompt.ts
// @(#): Claude CLI へのバッチプロンプト文字列構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';

// ─── internal ───
// functions
import { extractConversation } from './common-utils.ts';
// constants
import {
  CHATLOG_BLOCK_CLOSE,
  CHATLOG_BLOCK_OPEN_TEMPLATE,
  CHATLOG_DELIMITER_ESCAPED,
  CHATLOG_DELIMITER_MARK,
} from '../constants/common.constants.ts';

// ─────────────────────────────────────────────
// バッチプロンプト構築
// ─────────────────────────────────────────────

/**
 * 本文中のデリミタ接頭辞を無害化し、ログ本文からブロック境界を偽装できないようにする。
 *
 * @param body - 埋め込み対象の本文テキスト
 * @returns デリミタ接頭辞を `CHATLOG_DELIMITER_ESCAPED` に置換した本文
 */
const _neutralizeDelimiters = (body: string): string =>
  body.replaceAll(CHATLOG_DELIMITER_MARK, CHATLOG_DELIMITER_ESCAPED);

/**
 * 単一エントリをデリミタで囲んだブロック文字列に変換する。
 *
 * @param entry - 変換対象の `ChatlogEntry`
 * @returns `<<<CHATLOG file="NAME">>>` 〜 `<<<END_CHATLOG>>>` で囲んだブロック
 */
const _buildBlock = (entry: ChatlogEntry): string => {
  const filename = entry.filename;
  if (filename === undefined) {
    throw new ChatlogError('InvalidArgs', 'MissingFilePath', 'entry.filePath is required');
  }
  const open = CHATLOG_BLOCK_OPEN_TEMPLATE.replace('{file}', filename);
  const body = _neutralizeDelimiters(extractConversation(entry.content)).trimEnd();
  return `${open}\n${body}\n${CHATLOG_BLOCK_CLOSE}\n\n`;
};

/**
 * 読み込み済み `ChatlogEntry[]` から Claude CLI へ渡すバッチプロンプト文字列を構築する。
 *
 * 各ログは開始・終了デリミタで囲む。本文中に現れたデリミタ接頭辞は無害化するため、
 * ログ本文が境界を偽装して判定タスクを乗っ取ることはできない。
 *
 * @param entries - 読み込み済みの `ChatlogEntry` 配列
 * @returns デリミタで区切ったバッチプロンプト文字列。空配列の場合は `''`
 */
export const buildBatchPrompt = (entries: ChatlogEntry[]): string => entries.map(_buildBlock).join('');
