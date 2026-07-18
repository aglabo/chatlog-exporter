// src: scripts/exporter/types/chatgpt-provider.types.ts
// @(#): ChatGPT エクスポーター用 Provider 型定義（依存性注入）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { PeriodRange } from '../../types/filter.types.ts';
import type { ExportedSession } from '../../types/session.types.ts';
import type { ChatGPTConversation } from './chatgpt-entry.types.ts';

/** 指定ディレクトリから conversations-*.json ファイルパス一覧を返す Provider */
export type FindFilesProvider = (baseDir: string) => Promise<string[]>;

/** ChatGPT 会話オブジェクトを ExportedSession に変換する Provider */
export type ParseConversationProvider = (
  conv: ChatGPTConversation,
  range: PeriodRange,
) => Promise<ExportedSession | null>;

/** ExportedSession を Markdown ファイルに書き出し、パスを返す Provider */
export type WriteSessionProvider = (outputDir: string, agent: string, session: ExportedSession) => Promise<string>;
