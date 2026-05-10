// src: scripts/libs/classify-file.ts
// @(#): ファイル名・会話内容によるノイズ判定ロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import {
  countChars,
  getAssistantTurns,
  getUserTurns,
  hasUserTurn,
  isSingleUserTurn,
  parseConversation,
} from '../../../_scripts/libs/chatlogs/conversation-utils.ts';
import type { Conversation } from '../../../_scripts/types/conversation.types.ts';
import { MIN_ASSISTANT_CHARS } from '../constants/filter.constants.ts';
import {
  NOISE_FILENAME_PATTERNS,
  NOISE_USER_EXACT_PATTERNS,
  NOISE_USER_PREFIX_PATTERNS,
  SYSTEM_TAG_PATTERN,
} from '../constants/patterns.constants.ts';

// ─────────────────────────────────────────────
// 個別判定ロジック
// ─────────────────────────────────────────────

export const checkFilename = (filename: string): string | null => {
  const lower = filename.toLowerCase();
  for (const pat of NOISE_FILENAME_PATTERNS) {
    if (pat.test(lower)) { return `ファイル名パターン: ${pat}`; }
  }
  return null;
};

export const checkUserContent = (turns: Conversation): string | null => {
  if (!hasUserTurn(turns)) { return 'Userターンが存在しない'; }

  const _userTurns = getUserTurns(turns);

  // 全Userターンがシステムタグのみ
  if (_userTurns.every((t) => SYSTEM_TAG_PATTERN.test(t.text))) {
    return '全UserターンがシステムTagのみ';
  }

  // 全Userターンが /コマンドのみ
  if (_userTurns.every((t) => t.text.trim().split('\n').every((l) => l.trim().startsWith('/')))) {
    return '全Userターンが/コマンドのみ';
  }

  // 1ターンのみの詳細チェック
  if (isSingleUserTurn(turns)) {
    const text = _userTurns[0].text;

    // 前方一致パターン
    for (const { pattern, label } of NOISE_USER_PREFIX_PATTERNS) {
      if (pattern.test(text)) { return label; }
    }

    // 完全一致パターン
    for (const { pattern, label } of NOISE_USER_EXACT_PATTERNS) {
      if (pattern.test(text.trim())) { return label; }
    }

    // システムタグのみ
    if (SYSTEM_TAG_PATTERN.test(text)) { return 'UserがシステムTagのみ'; }
  }

  return null;
};

export const checkAssistantContent = (turns: Conversation): string | null => {
  if (isSingleUserTurn(turns)) {
    const _assistantTurns = getAssistantTurns(turns);
    if (_assistantTurns.length > 0) {
      const total = countChars(_assistantTurns);
      if (total < MIN_ASSISTANT_CHARS) {
        return `Assistant応答が短すぎる (${total} < ${MIN_ASSISTANT_CHARS} 文字)`;
      }
    }
  }
  return null;
};

// ─────────────────────────────────────────────
// メイン判定関数
// ─────────────────────────────────────────────

export const classifyFile = (filename: string, text: string): { isNoise: boolean; reason: string } => {
  // 1. ファイル名チェック
  const filenameReason = checkFilename(filename);
  if (filenameReason) { return { isNoise: true, reason: filenameReason }; }

  // 2. ChatlogEntry インスタンス生成（frontmatter + content 読み込み）
  //    不正フォーマット（閉じ区切りなし）の場合は先頭の区切り行を除去して再生成する
  let _entry: ChatlogEntry;
  try {
    _entry = new ChatlogEntry(text);
  } catch {
    _entry = new ChatlogEntry(text.replace(/^---\n/, ''));
  }

  // 3. 会話ターン解析
  const turns = parseConversation(_entry.content);

  // 4. User本文チェック
  const userReason = checkUserContent(turns);
  if (userReason) { return { isNoise: true, reason: userReason }; }

  // 5. Assistant応答の長さチェック
  const assistantReason = checkAssistantContent(turns);
  if (assistantReason) { return { isNoise: true, reason: assistantReason }; }

  return { isNoise: false, reason: '' };
};
