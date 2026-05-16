// src: scripts/types/patterns.types.ts
// @(#): filter-chatlogs ノイズ判定パターン型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** ConversationEntry の制御値を一元管理するオブジェクト定数。 */
export const ENTRY_CONTROL = {
  SKIP: 'skip',
} as const;

/** ConversationEntry の制御値型（ENTRY_CONTROL から自動導出）。 */
export type EntryControl = typeof ENTRY_CONTROL[keyof typeof ENTRY_CONTROL];

/** パターンマッチングエントリ（pattern 必須、control なし）。 */
export type MatchEntry = {
  target: 'user' | 'assistant';
  pattern: RegExp;
};

/** 会話エントリの判定対象・パターンを定義する型。 */
export type ConversationEntry = {
  target: 'user' | 'assistant';
  pattern?: RegExp;
  control?: EntryControl;
};

/** ノイズ会話パターンを定義する型（entries の全エントリが一致した場合にノイズと判定）。 */
export type NoiseConversationPattern = {
  label: string;
  entries: ConversationEntry[];
};
