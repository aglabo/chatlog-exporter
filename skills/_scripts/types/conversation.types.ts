// src: skills/_scripts/types/conversation.types.ts
// @(#): 会話ターン関連型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 会話の1ターンを表す。role は発話者、content は発話内容。 */
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Turn の読み取り専用配列。会話全体を表す。 */
export type Conversation = readonly Turn[];
