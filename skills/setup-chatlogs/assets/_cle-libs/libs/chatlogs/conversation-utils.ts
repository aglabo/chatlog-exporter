// src: skills/_cle-libs/libs/chatlogs/conversation-utils.ts
// @(#): 会話ターン操作ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// constants
import { ConversationRole } from '../../types/conversation-role.const.types.ts';
// types
import type { Conversation, Turn } from '../../types/conversation.types.ts';

/** Conversation から role=user のターンのみ返す。 */
export const getUserTurns = (conv: Conversation): readonly Turn[] =>
  conv.filter((t) => t.role === ConversationRole.user);

/** Conversation から role=assistant のターンのみ返す。 */
export const getAssistantTurns = (conv: Conversation): readonly Turn[] =>
  conv.filter((t) => t.role === ConversationRole.assistant);

/** Turn[] の content の合計文字数を返す。空配列のとき 0。 */
export const countChars = (turns: readonly Turn[]): number => turns.reduce((sum, t) => sum + t.content.length, 0);

/** Conversation に user ターンが 1 件以上あれば true。 */
export const hasUserTurn = (conv: Conversation): boolean => conv.some((t) => t.role === ConversationRole.user);

/** User ターンがちょうど 1 件のとき true。 */
export const isSingleUserTurn = (conv: Conversation): boolean => getUserTurns(conv).length === 1;

/** Markdown 本文から User/Assistant の会話ターンを抽出する。 */
export const parseConversation = (body: string): Conversation => {
  const _turns: Turn[] = [];
  const pattern = /^### (User|Assistant)\s*$/gm;
  const matches = [...body.matchAll(pattern)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const role = m[1].toLowerCase() as ConversationRole;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const text = body.slice(start, end).trim();
    if (text) { _turns.push({ role, content: text }); }
  }
  return _turns;
};

/**
 * Turn[] を `### User` / `### Assistant` Markdown に再構築する。
 *
 * @param conv - 変換する会話ターン配列
 * @param maxChars - 指定時はその文字数で切り詰める
 * @returns 再構築した Markdown 文字列
 */
export const renderConversation = (conv: Conversation, maxChars?: number): string => {
  const _parts = conv.map((t) => {
    const role = t.role === ConversationRole.user ? 'User' : 'Assistant';
    return `### ${role}\n${t.content}`;
  });
  const _body = _parts.join('\n\n');
  return maxChars !== undefined ? _body.slice(0, maxChars) : _body;
};
