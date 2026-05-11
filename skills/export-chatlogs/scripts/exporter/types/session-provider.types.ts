// src: scripts/exporter/types/session-provider.types.ts
// @(#): claude/codex エクスポーター共通 Provider 型定義（依存性注入）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { PeriodRange } from '../../types/filter.types.ts';
import type { ExportedSession } from '../../types/session.types.ts';

/** JSONL セッションファイルパス一覧を返す Provider */
export type FindSessionsProvider = (period: PeriodRange, projectDir?: string) => Promise<string[]>;

/** JSONL ファイルを ExportedSession に変換する Provider */
export type ParseSessionProvider = (filePath: string, range: PeriodRange) => Promise<ExportedSession | null>;

/** ExportedSession を Markdown ファイルに書き出し、パスを返す Provider */
export type WriteSessionProvider = (outputDir: string, agent: string, session: ExportedSession) => Promise<string>;
