// src: skills/_cle-libs/libs/ai/prompt-utils.ts
// @(#): AI プロンプト構築ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// functions
import { parseConversation, renderConversation } from '../chatlogs/conversation-utils.ts';

// classes
import { ChatlogEntry } from '../../classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

/**
 * エントリ配列を会話ターンのみ抽出した `=== <filename> ===\n<body>\n` 形式の文字列に変換する。
 *
 * - 空配列の場合は `''` を返す。
 * - body は `parseConversation` + `renderConversation` で会話ターンのみ抽出する。
 * - `maxContentLength === 0` の場合は切り詰めなし（全会話）。
 * - `maxContentLength > 0` の場合は `maxContentLength` 文字で切り詰める。
 * - 各ブロックを `\n` で結合する。
 *
 * @param entries - 変換する `ChatlogEntry` の配列
 * @param maxContentLength - body の最大文字数（0 = 全文）
 * @returns フォーマット済みの結合文字列。空配列の場合は `''`。
 */
export const buildConversationEntries = (entries: ChatlogEntry[], maxContentLength = 0): string => {
  if (entries.length === 0) { return ''; }
  return entries.map((entry) => {
    const filename = entry.filename;
    if (filename === undefined) {
      throw new ChatlogError('InvalidArgs', 'MissingFilePath', 'entry.filePath is required');
    }
    const body = renderConversation(parseConversation(entry.content), maxContentLength || undefined).trimEnd() + '\n';
    return `=== ${filename} ===\n${body}\n`;
  }).join('');
};

/**
 * エントリ配列を `=== <filename> ===\n<body>\n` 形式の文字列に変換する。
 *
 * - 空配列の場合は `''` を返す。
 * - `maxContentLength === 0` の場合は `entry.content`（全文）を body とする。
 * - `maxContentLength > 0` の場合は `entry.truncateContent(maxContentLength)` で切り詰める。
 * - 各ブロックを `\n` で結合する。
 *
 * @param entries - 変換する `ChatlogEntry` の配列
 * @param maxContentLength - body の最大文字数（0 = 全文）
 * @returns フォーマット済みの結合文字列。空配列の場合は `''`。
 */
export const buildUserEntries = (entries: ChatlogEntry[], maxContentLength = 0): string => {
  if (entries.length === 0) { return ''; }
  return entries.map((entry) => {
    const filename = entry.filename;
    if (filename === undefined) {
      throw new ChatlogError('InvalidArgs', 'MissingFilePath', 'entry.filePath is required');
    }
    const body = maxContentLength === 0
      ? entry.content.trimEnd() + '\n'
      : entry.truncateContent(maxContentLength);
    return `=== ${filename} ===\n${body}\n`;
  }).join('');
};
