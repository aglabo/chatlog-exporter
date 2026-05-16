// src: skills/_scripts/types/conversation-role.const.types.ts
// @(#): 会話ロール識別子の定数と派生型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 会話ロール識別子の定数オブジェクト。`'user' | 'assistant'` のリテラル直書きを置き換える。 */
export const ConversationRole = {
  user: 'user',
  assistant: 'assistant',
} as const;

/** `ConversationRole` の値から派生したユニオン型。`'user' | 'assistant'` と等価。 */
export type ConversationRole = typeof ConversationRole[keyof typeof ConversationRole];
