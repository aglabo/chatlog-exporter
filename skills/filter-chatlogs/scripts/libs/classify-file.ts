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
import { MIN_ASSISTANT_CHARS } from '../constants/common.constants.ts';
import {
  NOISE_ASSISTANT_PATTERNS,
  NOISE_CONVERSATION_PATTERNS,
  NOISE_FILENAME_PATTERNS,
  NOISE_PROMPT_PATTERNS,
  NOISE_USER_PATTERNS,
  SYSTEM_TAG_REGEX,
} from '../constants/patterns.constants.ts';
import { ENTRY_CONTROL } from '../types/patterns.types.ts';
import type {
  ConversationEntry,
  MatchEntry,
  NoiseConversationPattern,
} from '../types/patterns.types.ts';

// ─────────────────────────────────────────────
// 個別判定ロジック
// ─────────────────────────────────────────────

/** pattern フィールドを持ち、control フィールドを持たない MatchEntry かどうかを判定する型ガード。 */
const _isMatchEntry = (e: ConversationEntry): e is MatchEntry => !('control' in e);

const _matchUserPattern = (text: string, patterns: NoiseConversationPattern[]): string | null => {
  for (const { label, entries } of patterns) {
    const _userEntries = entries.filter((e) => e.target === 'user').filter(_isMatchEntry);
    if (_userEntries.length === 0) { continue; }
    if (_userEntries.every((e) => e.pattern.test(text))) { return label; }
  }
  return null;
};

const _matchConversationPattern = (
  conversation: Conversation,
  patterns: NoiseConversationPattern[],
): string | null => {
  const _userTurns = getUserTurns(conversation);
  if (_userTurns.length === 0) { return null; }
  const _userText = _userTurns[0].text;

  const _assistantTurns = getAssistantTurns(conversation);
  if (_assistantTurns.length === 0) {
    const _userOnlyPatterns = patterns.filter((p) => !p.entries.some((e) => e.target === 'assistant'));
    return _matchUserPattern(_userText, _userOnlyPatterns);
  }

  const _entryMatches = (e: ConversationEntry, text: string): boolean =>
    'control' in e && e.control === ENTRY_CONTROL.SKIP
      ? true
      : e.pattern !== undefined && e.pattern.test(text);

  for (const { label, entries } of patterns) {
    const _assistantEntries = entries.filter((e) => e.target === 'assistant');
    const _userEntries = entries.filter((e) => e.target === 'user').filter(_isMatchEntry);
    if (_userEntries.length === 0 && _assistantEntries.length === 0) { continue; }

    const _userMatch = _userEntries.length === 0 || _userEntries.every((e) => e.pattern!.test(_userText));
    const _assistantMatch = _assistantEntries.length === 0 || (
      _assistantEntries.length <= _assistantTurns.length
      && _assistantEntries.every((e, i) => _entryMatches(e, _assistantTurns[i].text))
    );
    if (_userMatch && _assistantMatch) { return label; }
  }
  return null;
};

export const checkFilename = (filename: string): string | null => {
  const lower = filename.toLowerCase();
  for (const pat of NOISE_FILENAME_PATTERNS) {
    if (pat.test(lower)) { return `ファイル名パターン: ${pat}`; }
  }
  return null;
};

export const checkUserContent = (conversation: Conversation): string | null => {
  if (!hasUserTurn(conversation)) { return 'Userターンが存在しない'; }

  const _userTurns = getUserTurns(conversation);

  // 全Userターンがシステムタグのみ
  if (_userTurns.every((t) => SYSTEM_TAG_REGEX.test(t.text))) {
    return '全UserターンがシステムTagのみ';
  }

  // 全Userターンが /コマンドのみ
  if (_userTurns.every((t) => t.text.trim().split('\n').every((l) => l.trim().startsWith('/')))) {
    return '全Userターンが/コマンドのみ';
  }

  // 1ターンのみの詳細チェック
  if (isSingleUserTurn(conversation)) {
    const text = _userTurns[0].text;

    const _patternReason = _matchUserPattern(text, NOISE_USER_PATTERNS);
    if (_patternReason) { return _patternReason; }

    // システムタグのみ
    if (SYSTEM_TAG_REGEX.test(text)) { return 'UserがシステムTagのみ'; }
  }

  return null;
};

export const checkConversationPattern = (conversation: Conversation): string | null => {
  if (!isSingleUserTurn(conversation)) { return null; }
  const text = getUserTurns(conversation)[0].text;
  return _matchUserPattern(text, NOISE_CONVERSATION_PATTERNS);
};

export const checkPromptContent = (conversation: Conversation): string | null => {
  if (!isSingleUserTurn(conversation)) { return null; }
  const text = getUserTurns(conversation)[0].text;
  return _matchUserPattern(text, NOISE_PROMPT_PATTERNS);
};

export const checkAssistantContent = (conversation: Conversation): string | null => {
  if (isSingleUserTurn(conversation)) {
    const _assistantTurns = getAssistantTurns(conversation);
    if (_assistantTurns.length > 0) {
      const _patternReason = _matchConversationPattern(conversation, NOISE_ASSISTANT_PATTERNS);
      if (_patternReason) { return _patternReason; }

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
  const conversation = parseConversation(_entry.content);

  // 4. User本文チェック
  const userReason = checkUserContent(conversation);
  if (userReason) { return { isNoise: true, reason: userReason }; }

  // 5. 会話パターンチェック
  const conversationReason = checkConversationPattern(conversation);
  if (conversationReason) { return { isNoise: true, reason: conversationReason }; }

  // 6. プロンプトパターンチェック
  const promptReason = checkPromptContent(conversation);
  if (promptReason) { return { isNoise: true, reason: promptReason }; }

  // 7. Assistant応答の長さチェック
  const assistantReason = checkAssistantContent(conversation);
  if (assistantReason) { return { isNoise: true, reason: assistantReason }; }

  return { isNoise: false, reason: '' };
};

// テスト用エクスポート（本番コードでは使用しない）
export { _matchConversationPattern, _matchUserPattern };
