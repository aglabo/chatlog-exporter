// src: scripts/libs/classify-file.ts
// @(#): ファイル名・会話内容によるノイズ判定ロジック
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

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
// constants
import { ConversationRole } from '../../../_scripts/types/conversation-role.const.types.ts';
// types
import type { Conversation, Turn } from '../../../_scripts/types/conversation.types.ts';
// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── internal ───
// constants
import { MIN_ASSISTANT_CHARS } from '../constants/common.constants.ts';
import {
  NOISE_ASSISTANT_PATTERNS,
  NOISE_CONVERSATION_PATTERNS,
  NOISE_FILENAME_PATTERNS,
  NOISE_PROMPT_PATTERNS,
  NOISE_USER_PATTERNS,
  SYSTEM_TAG_REGEX,
} from '../constants/patterns.constants.ts';
// types
import { FILTER_DECISIONS } from '../types/filter-decision.const.types.ts';
import type { NoiseDiscardFile } from '../types/noise-filter.types.ts';
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
    const _userEntries = entries.filter((e) => e.target === ConversationRole.user).filter(_isMatchEntry);
    if (_userEntries.length === 0) { continue; }
    if (_userEntries.every((e) => e.pattern.test(text))) { return label; }
  }
  return null;
};

const _entryMatches = (e: ConversationEntry, text: string): boolean =>
  'control' in e && e.control === ENTRY_CONTROL.SKIP
    ? true
    : e.pattern !== undefined && e.pattern.test(text);

const _userEntriesMatch = (entries: ConversationEntry[], userText: string): boolean => {
  const _matchEntries = entries.filter((e) => e.target === ConversationRole.user).filter(_isMatchEntry);
  return _matchEntries.length === 0 || _matchEntries.every((e) => e.pattern!.test(userText));
};

const _assistantEntriesMatch = (entries: ConversationEntry[], assistantTurns: readonly Turn[]): boolean => {
  const _assistantEntries = entries.filter((e) => e.target === ConversationRole.assistant);
  return _assistantEntries.length === 0 || (
    _assistantEntries.length <= assistantTurns.length
    && _assistantEntries.every((e, i) => _entryMatches(e, assistantTurns[i].content))
  );
};

const _matchConversationPattern = (
  conversation: Conversation,
  patterns: NoiseConversationPattern[],
): string | null => {
  const _userTurns = getUserTurns(conversation);
  if (_userTurns.length === 0) { return null; }
  const _userText = _userTurns[0].content;

  const _assistantTurns = getAssistantTurns(conversation);
  if (_assistantTurns.length === 0) {
    const _userOnlyPatterns = patterns.filter((p) => !p.entries.some((e) => e.target === ConversationRole.assistant));
    return _matchUserPattern(_userText, _userOnlyPatterns);
  }

  for (const { label, entries } of patterns) {
    const _hasUserEntries = entries.some((e) => e.target === ConversationRole.user && _isMatchEntry(e));
    const _hasAssistantEntries = entries.some((e) => e.target === ConversationRole.assistant);
    if (!_hasUserEntries && !_hasAssistantEntries) { continue; }

    if (_userEntriesMatch(entries, _userText) && _assistantEntriesMatch(entries, _assistantTurns)) {
      return label;
    }
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
  if (_userTurns.every((t) => SYSTEM_TAG_REGEX.test(t.content))) {
    return '全UserターンがシステムTagのみ';
  }

  // 全Userターンが /コマンドのみ
  if (_userTurns.every((t) => t.content.trim().split('\n').every((l: string) => l.trim().startsWith('/')))) {
    return '全Userターンが/コマンドのみ';
  }

  // 1ターンのみの詳細チェック
  if (isSingleUserTurn(conversation)) {
    const text = _userTurns[0].content;

    const _patternReason = _matchUserPattern(text, NOISE_USER_PATTERNS);
    if (_patternReason) { return _patternReason; }

    // システムタグのみ
    if (SYSTEM_TAG_REGEX.test(text)) { return 'UserがシステムTagのみ'; }
  }

  return null;
};

export const checkConversationPattern = (conversation: Conversation): string | null => {
  if (!isSingleUserTurn(conversation)) { return null; }
  const text = getUserTurns(conversation)[0].content;
  return _matchUserPattern(text, NOISE_CONVERSATION_PATTERNS);
};

export const checkPromptContent = (conversation: Conversation): string | null => {
  const _userTurns = getUserTurns(conversation);
  if (_userTurns.length === 0) { return null; }
  return _matchUserPattern(_userTurns[0].content, NOISE_PROMPT_PATTERNS);
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

/**
 * テキストから `ChatlogEntry` を生成し、本文を会話ターンに解析する。
 *
 * frontmatter の閉じ区切りがない不正フォーマットの場合は、先頭の区切り行を除去して再生成する。
 *
 * @param text - チャットログの生テキスト（frontmatter + content）
 * @returns 解析済みの会話ターン配列
 */
export const readConversation = (text: string): Conversation => {
  let _entry: ChatlogEntry;
  try {
    _entry = new ChatlogEntry(text);
  } catch {
    _entry = new ChatlogEntry(text.replace(/^---\n/, ''));
  }
  return parseConversation(_entry.content);
};

/**
 * 会話に対して User本文・会話パターン・プロンプトパターン・Assistant応答長のチェックを順に適用する。
 *
 * @param conversation - 解析済みの会話ターン配列
 * @returns 最初に一致したチェックの reason。いずれも一致しない場合は `null`
 */
export const classifyConversation = (conversation: Conversation): string | null =>
  checkUserContent(conversation)
    ?? checkConversationPattern(conversation)
    ?? checkPromptContent(conversation)
    ?? checkAssistantContent(conversation);

/**
 * ファイル名パターンのみでノイズ判定を行い、一致した場合は `NoiseDiscardFile` を返す。
 *
 * 会話内容の判定は行わない。呼び出し元が別途 `classifyConversation` を呼び出す想定。
 * 複数ファイルに対するループ処理は呼び出し元が行う。
 *
 * @param file - ファイルパスとファイル名
 * @returns ファイル名パターンに一致した場合は `NoiseDiscardFile`、一致しない場合は `null`
 */
export const classifyFile = (
  file: { filePath: string; filename: string },
): NoiseDiscardFile | null => {
  const reason = checkFilename(file.filename);
  return reason === null
    ? null
    : { filePath: file.filePath, filename: file.filename, reason, decision: FILTER_DECISIONS.DISCARD };
};

// テスト用エクスポート（本番コードでは使用しない）
export { _matchConversationPattern, _matchUserPattern };
