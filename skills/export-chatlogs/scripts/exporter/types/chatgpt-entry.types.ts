// src: scripts/exporter/types/chatgpt-entry.types.ts
// @(#): ChatGPT エージェント入力型定義（conversations JSON エントリ）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * ChatGPT conversations-*.json の1会話オブジェクトを表す型。
 */
export interface ChatGPTConversation {
  id: string;
  conversation_id: string;
  create_time: number; // Unix timestamp (float)
  title: string;
  default_model_slug?: string;
  current_node?: string; // 末尾ノードID（optional）
  mapping: Record<string, ChatGPTMappingNode>;
}

/**
 * ChatGPT conversations の mapping 内の1ノードを表す型。
 */
export interface ChatGPTMappingNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

/**
 * ChatGPT メッセージ本体を表す型。
 */
export interface ChatGPTMessage {
  id: string;
  author: { role: string };
  create_time: number | null;
  content: {
    content_type: string;
    parts?: unknown[];
  };
  weight?: number;
}
