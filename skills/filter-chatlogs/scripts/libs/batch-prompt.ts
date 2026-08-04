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
// functions
import { buildConversationEntries } from '../../../_cle-libs/libs/ai/prompt-utils.ts';

// ─── internal ───
// constants
import { MAX_BODY_CHARS } from '../constants/common.constants.ts';

// ─────────────────────────────────────────────
// バッチプロンプト構築
// ─────────────────────────────────────────────

/**
 * 読み込み済み `ChatlogEntry[]` から Claude CLI へ渡すバッチプロンプト文字列を構築する。
 *
 * @param entries - 読み込み済みの `ChatlogEntry` 配列
 * @returns `=== filename ===\n<body>\n` 形式のバッチプロンプト文字列。空配列の場合は `''`
 */
export const buildBatchPrompt = (entries: ChatlogEntry[]): string => {
  if (entries.length === 0) { return ''; }
  return buildConversationEntries(entries, MAX_BODY_CHARS);
};
