// src: scripts/exporter/claude-exporter.ts
// @(#): Claude エージェント専用のセッションエクスポート処理
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// libs
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { findDirectories, findEntries } from '../../../_scripts/libs/file-ops/find-entries.ts';
import { homeDir } from '../../../_scripts/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { isoToDate } from '../../../_scripts/libs/text/date-utils.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// libs
import { inPeriod, parsePeriod } from '../libs/period-filter.ts';
import { writeSession } from '../libs/session-writer.ts';
import { isSkippable, isSkippableSession } from '../libs/skip-rules.ts';
// types
import type { ExportConfig } from '../types/export-config.types.ts';
import type { ExportResult } from '../types/export-result.types.ts';
import type { PeriodRange } from '../types/filter.types.ts';
import type { ExportedSession, SessionMeta, Turn } from '../types/session.types.ts';
import type { ClaudeEntry } from './types/claude-entry.types.ts';
import type {
  FindSessionsProvider,
  ParseSessionProvider,
  WriteSessionProvider,
} from './types/session-provider.types.ts';

// ─────────────────────────────────────────────
// テキスト抽出
// ─────────────────────────────────────────────

/**
 * Claude JSONL エントリの `message.content` フィールドからユーザーテキストを抽出する。
 *
 * content の型に応じて以下のように処理する:
 * - **文字列**: `<local-command-stdout` で始まる場合は空文字列を返す。それ以外はそのまま返す
 * - **配列**: `type === "text"` かつ除外プレフィックスを持たないテキストのみをスペース連結して返す
 *   除外プレフィックス: `<ide_opened_file`, `<ide_selection`, `<local-command-caveat`,
 *   `<local-command-stdout`, `<system-reminder`。`type === "tool_result"` は無条件スキップ
 * - **その他**: 空文字列を返す
 *
 * @param content `ClaudeEntry.message.content` の値
 * @returns 抽出されたユーザーテキスト。抽出不能または除外対象の場合は空文字列
 */
export const extractClaudeUserText = (content: unknown): string => {
  if (typeof content === 'string') {
    const text = content.trim();
    if (/^<local-command-stdout\b/.test(text)) { return ''; }
    return text;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item !== 'object' || !item) { continue; }
      const it = item as Record<string, unknown>;
      if (it.type === 'tool_result') { continue; }
      if (it.type === 'text' && typeof it.text === 'string') {
        const t = it.text;
        if (
          /^<(ide_opened_file|ide_selection|local-command-caveat|local-command-stdout|system-reminder)\b/.test(t)
        ) { continue; }
        parts.push(t);
      }
    }
    return parts.join(' ').trim();
  }
  return '';
};

/**
 * Claude JSONL エントリの `message.content` フィールドからアシスタントテキストを抽出する。
 *
 * - **文字列**: そのままトリムして返す
 * - **配列**: `type === "text"` のテキストを改行連結して返す
 * - **その他**: 空文字列を返す
 *
 * @param content `ClaudeEntry.message.content` の値
 * @returns 抽出されたアシスタントテキスト。抽出不能の場合は空文字列
 */
export const extractClaudeAssistantText = (content: unknown): string => {
  if (typeof content === 'string') { return content.trim(); }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item !== 'object' || !item) { continue; }
      const it = item as Record<string, unknown>;
      if (it.type === 'text' && typeof it.text === 'string') {
        parts.push(it.text);
      }
    }
    return parts.join('\n').trim();
  }
  return '';
};

// ─────────────────────────────────────────────
// セッションパーサー
// ─────────────────────────────────────────────

/**
 * Claude JSONL ファイルを読み込み、指定期間内の会話セッションを抽出する。
 *
 * @param filePath Claude JSONL ファイルの絶対パス
 * @param range `parsePeriod()` が生成した期間フィルタ
 * @returns パース結果の `ExportedSession`、スキップ対象の場合は `null`
 */
export const parseClaudeSession = async (
  filePath: string,
  range: PeriodRange,
): Promise<ExportedSession | null> => {
  let lines: string[];
  try {
    const text = await readTextFile(filePath);
    lines = text.split('\n').filter((l) => l.trim());
  } catch {
    return null;
  }

  const entries: ClaudeEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip
    }
  }

  // 期間内エントリに絞る
  const filtered = entries.filter((e) => {
    if (!e.timestamp) { return false; }
    return inPeriod(e.timestamp, range);
  });
  if (filtered.length === 0) { return null; }

  // 最初の意味あるユーザーエントリを探す
  let firstEntry: ClaudeEntry | null = null;
  for (const e of filtered) {
    if (e.type !== 'user' || e.isMeta) { continue; }
    const text = extractClaudeUserText(e.message?.content);
    if (!text || isSkippable(text)) { continue; }
    firstEntry = e;
    break;
  }
  if (!firstEntry) { return null; }

  const cwd = firstEntry.cwd ?? '';
  const project = cwd ? normalizePath(cwd).split('/').pop()! : 'unknown';

  // 会話ターン抽出
  const turns: Turn[] = [];
  let lastAssistantMsgId = '';
  let lastAssistantIdx = -1;

  for (const e of filtered) {
    if (e.type === 'user') {
      if (e.isMeta) { continue; }
      const text = extractClaudeUserText(e.message?.content);
      if (!text || isSkippable(text)) { continue; }
      turns.push({ role: 'user', text });
      lastAssistantMsgId = '';
    } else if (e.type === 'assistant') {
      if (e.isMeta) { continue; }
      const msgId = e.message?.id ?? '';
      const text = extractClaudeAssistantText(e.message?.content);
      if (!text) { continue; }
      if (msgId && msgId === lastAssistantMsgId && lastAssistantIdx >= 0) {
        turns[lastAssistantIdx].text += text;
      } else {
        turns.push({ role: 'assistant', text });
        lastAssistantIdx = turns.length - 1;
        lastAssistantMsgId = msgId;
      }
    }
  }
  if (turns.length === 0) { return null; }

  const firstUserText = extractClaudeUserText(firstEntry.message?.content);
  if (isSkippableSession(firstUserText)) { return null; }
  const meta: SessionMeta = {
    sessionId: firstEntry.sessionId ?? 'unknown',
    date: isoToDate(firstEntry.timestamp ?? ''),
    project,
    slug: firstEntry.slug ?? '',
    firstUserText,
  };

  return { meta, turns };
};

// ─────────────────────────────────────────────
// セッションファイル探索
// ─────────────────────────────────────────────

/**
 * `~/.claude/projects/` 配下の全 JSONL セッションファイルパスを収集する。
 *
 * `subagents/` サブディレクトリ内のファイルはサブエージェントのセッションのため除外する。
 *
 * @param _period 期間フィルタ（未使用。パーサー側でフィルタリングするため）
 * @returns ソート済みの JSONL ファイルパス配列
 */
export const findClaudeSessions = async (
  _period: PeriodRange,
  projectDir?: string,
): Promise<string[]> => {
  const projectsDir = projectDir ?? `${homeDir()}/.claude/projects`;
  const _dirs = await findDirectories(projectsDir);
  return findEntries(_dirs, '.jsonl', { exclude: ['subagents'] });
};

// ─────────────────────────────────────────────
// オーケストレーション
// ─────────────────────────────────────────────

/**
 * Claude エージェントのセッション履歴をエクスポートするオーケストレーション関数。
 *
 * 処理フロー:
 * 1. `parsePeriod()` で期間フィルタを生成
 * 2. `findSessions()` でセッションファイル一覧を収集
 * 3. 各ファイルを `parseSession()` でパースし、有効なセッションを `writeSession()` で書き出す
 *
 * `_providers` を省略した場合は実際のファイルシステム操作を行う。
 * テスト時は `_providers` に差し替え実装を渡すことで I/O なしに動作を検証できる。
 *
 * @param config エクスポート設定（agent, period, outputDir）
 * @param _providers テスト用 Provider（省略時は実実装を使用）
 * @returns エクスポート結果（exportedCount, outputPaths）
 */
export const exportClaude = async (
  config: ExportConfig,
  _providers?: {
    findSessions?: FindSessionsProvider;
    parseSession?: ParseSessionProvider;
    writeSession?: WriteSessionProvider;
  },
): Promise<ExportResult> => {
  const range = parsePeriod(config.period);

  const _findSessions = _providers?.findSessions
    ?? ((period: PeriodRange) => findClaudeSessions(period, config.baseDir));
  const _parseSession = _providers?.parseSession
    ?? ((filePath: string, r: PeriodRange) => parseClaudeSession(filePath, r));
  const _writeSession = _providers?.writeSession ?? writeSession;

  const sessionFiles = await _findSessions(range);

  const outputPaths: string[] = [];
  let skippedCount = 0;
  let errorCount = 0;

  for (const file of sessionFiles) {
    try {
      const session = await _parseSession(file, range);
      if (!session) {
        skippedCount++;
        continue;
      }
      const outPath = await _writeSession(config.outputDir, config.agent, session);
      outputPaths.push(outPath);
    } catch {
      errorCount++;
    }
  }

  return { exportedCount: outputPaths.length, skippedCount, errorCount, outputPaths };
};
