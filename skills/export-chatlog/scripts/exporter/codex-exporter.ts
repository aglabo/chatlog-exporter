// src: scripts/exporter/codex-exporter.ts
// @(#): Codex エージェント専用のセッションエクスポート処理
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── External modules ───────────────────────────────────────────────────────
import { homeDir } from '../../../_scripts/libs/file-io/dir-utils.ts';
import { findEntries } from '../../../_scripts/libs/file-io/find-entries.ts';
import { normalizePath } from '../../../_scripts/libs/file-io/path-utils.ts';
import { isoToDate } from '../../../_scripts/libs/text/date-utils.ts';

// ─── Internal modules ───────────────────────────────────────────────────────
import { inPeriod, parsePeriod } from '../libs/period-filter.ts';
import { writeSession } from '../libs/session-writer.ts';
import { isSkippable, isSkippableSession } from '../libs/skip-rules.ts';

// ─── Types ──────────────────────────────────────────────────────────────────
import type { ExportConfig } from '../types/export-config.types.ts';
import type { ExportResult } from '../types/export-result.types.ts';
import type { PeriodRange } from '../types/filter.types.ts';
import type { ExportedSession, SessionMeta, Turn } from '../types/session.types.ts';
import type { CodexEntry } from './types/codex-entry.types.ts';
import type {
  FindSessionsProvider,
  ParseSessionProvider,
  WriteSessionProvider,
} from './types/session-provider.types.ts';

// ─────────────────────────────────────────────
// テキスト前処理
// ─────────────────────────────────────────────

/**
 * テキストから `<user_instructions>...</user_instructions>` ブロックを全て除去する。
 *
 * Codex が自動注入する `<user_instructions>` タグ（ユーザー設定のシステム指示）を
 * 除去し、除去後のテキストをトリムして返す。
 * これにより、スキップ判定やスラグ生成が `<user_instructions>` の内容に
 * 影響されないようにする。
 *
 * @param text 処理対象のテキスト
 * @returns `<user_instructions>` ブロックを除去してトリムしたテキスト
 */
export const stripUserInstructions = (text: string): string => {
  return text.replace(/<user_instructions>[\s\S]*?<\/user_instructions>/g, '').trim();
};

// ─────────────────────────────────────────────
// セッションパーサー
// ─────────────────────────────────────────────

/**
 * Codex JSONL ファイルを読み込み、指定期間内の会話セッションを抽出する。
 *
 * Codex の JSONL は以下の構造を持つ:
 * - `session_meta` エントリ: セッション ID・cwd・モデル名を保持（期間判定もここで行う）
 * - `response_item` エントリ: 会話ターン本体（role: "user" | "assistant"）
 *
 * user ターンの以下のコンテンツは除外する（Codex が自動注入するシステム情報）:
 * - `"# AGENTS.md instructions"` で始まるテキスト
 * - `"<permissions instructions>"` で始まるテキスト
 * - `"<environment_context>"` で始まるテキスト
 *
 * @param filePath Codex JSONL ファイルの絶対パス
 * @param range `parsePeriod()` が生成した期間フィルタ
 * @returns パース結果の `ExportedSession`、スキップ対象の場合は `null`
 */
export const parseCodexSession = async (
  filePath: string,
  range: PeriodRange,
): Promise<ExportedSession | null> => {
  let lines: string[];
  try {
    const text = await Deno.readTextFile(filePath);
    lines = text.split('\n').filter((l) => l.trim());
  } catch {
    return null;
  }

  const entries: CodexEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip
    }
  }

  // session_meta からセッション情報を取得
  const metaEntry = entries.find((e) => e.type === 'session_meta');
  if (!metaEntry) { return null; }

  const sessionId = metaEntry.payload.id ?? 'unknown';
  const cwd = metaEntry.payload.cwd ?? '';
  const project = cwd ? normalizePath(cwd).split('/').pop()! : 'unknown';
  const sessionTimestamp = metaEntry.timestamp;

  // 期間チェック（session_meta の timestamp で判定）
  if (!inPeriod(sessionTimestamp, range)) { return null; }

  // 会話ターン抽出（response_item の role=user/assistant）
  const turns: Turn[] = [];
  for (const e of entries) {
    if (e.type !== 'response_item') { continue; }
    const role = e.payload.role;
    if (role !== 'user' && role !== 'assistant') { continue; }

    const content = e.payload.content ?? [];
    const textType = role === 'user' ? 'input_text' : 'output_text';
    const parts: string[] = [];
    for (const c of content) {
      if (c.type === textType && c.text) {
        parts.push(c.text);
      }
    }
    const text = parts.join('\n').trim();
    if (!text) { continue; }
    const cleaned = role === 'user' ? stripUserInstructions(text) : text;
    if (!cleaned) { continue; }
    if (role === 'user' && isSkippable(cleaned)) { continue; }

    // user の AGENTS.md/permissions/environment_context は除外
    if (
      role === 'user' && (
        cleaned.startsWith('# AGENTS.md instructions')
        || cleaned.startsWith('<permissions instructions>')
        || cleaned.startsWith('<environment_context>')
      )
    ) { continue; }

    turns.push({ role: role as 'user' | 'assistant', text: cleaned });
  }

  // 意味あるユーザーターンがなければスキップ
  const firstUserTurn = turns.find((t) => t.role === 'user');
  if (!firstUserTurn) { return null; }
  if (isSkippableSession(firstUserTurn.text)) { return null; }

  const date = isoToDate(sessionTimestamp);
  const meta: SessionMeta = {
    sessionId,
    date,
    project,
    slug: '',
    firstUserText: firstUserTurn.text,
  };

  return { meta, turns };
};

// ─────────────────────────────────────────────
// セッションファイル探索
// ─────────────────────────────────────────────

/**
 * `~/.codex/sessions/` 配下の全 JSONL セッションファイルパスを収集する。
 *
 * `walkFiles()` で `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 形式の
 * ディレクトリツリーを再帰走査する。
 *
 * @param _period 期間フィルタ（未使用。パーサー側でフィルタリングするため）
 * @returns ソート済みの JSONL ファイルパス配列
 */
export const findCodexSessions = async (
  _period: PeriodRange,
): Promise<string[]> => {
  const sessionsDir = `${homeDir()}/.codex/sessions`;
  return await findEntries([sessionsDir], '.jsonl');
};

// ─────────────────────────────────────────────
// オーケストレーション
// ─────────────────────────────────────────────

/**
 * Codex エージェントのセッション履歴をエクスポートするオーケストレーション関数。
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
export const exportCodex = async (
  config: ExportConfig,
  _providers?: {
    findSessions?: FindSessionsProvider;
    parseSession?: ParseSessionProvider;
    writeSession?: WriteSessionProvider;
  },
): Promise<ExportResult> => {
  const range = parsePeriod(config.period);

  const _findSessions = _providers?.findSessions ?? findCodexSessions;
  const _parseSession = _providers?.parseSession
    ?? ((filePath: string, r: PeriodRange) => parseCodexSession(filePath, r));
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
