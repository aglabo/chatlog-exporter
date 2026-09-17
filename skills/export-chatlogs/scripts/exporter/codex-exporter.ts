// src: scripts/exporter/codex-exporter.ts
// @(#): Codex エージェント専用のセッションエクスポート処理
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// libs
import { readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { findEntries } from '../../../_cle-libs/libs/file-ops/find-entries.ts';
import { homeDir } from '../../../_cle-libs/libs/path-utils/path-env.ts';
import { getFilename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
import { isoToDate } from '../../../_cle-libs/libs/text/date-utils.ts';
// constants
import { ConversationRole } from '../../../_cle-libs/types/conversation-role.const.types.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// libs
import { inPeriod, parsePeriod } from '../libs/period-filter.ts';
import { resolveSessionId, writeSession } from '../libs/session-writer.ts';
import { isSkippable, isSkippableSession } from '../libs/skip-rules.ts';
// constants
import { CODEX_INJECTED_USER_PREFIXES } from '../constants/skip-rules.constants.ts';
// types
import type { Turn } from '../../../_cle-libs/types/conversation.types.ts';
import type { ExportConfig } from '../types/export-config.types.ts';
import type { ExportResult } from '../types/export-result.types.ts';
import type { PeriodRange } from '../types/filter.types.ts';
import type { ExportedSession, SessionMeta } from '../types/session.types.ts';
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
 * - `"<recommended_plugins>"` で始まるテキスト
 *
 * 接頭辞の一覧は `CODEX_INJECTED_USER_PREFIXES` で管理する。
 *
 * @param filePath Codex JSONL ファイルの絶対パス
 * @param range `parsePeriod()` が生成した期間フィルタ
 * @returns パース結果の `ExportedSession`、スキップ対象の場合は `null`
 */
export const parseCodexSession = async (
  filePath: string,
  range: PeriodRange,
): Promise<ExportedSession | null> => {
  const _entries = await _readCodexEntries(filePath);
  if (!_entries) { return null; }

  // session_meta からセッション情報を取得
  const _metaEntry = _entries.find((e) => e.type === 'session_meta');
  if (!_metaEntry) { return null; }

  // 期間チェック（session_meta の timestamp で判定）
  if (!inPeriod(_metaEntry.timestamp, range)) { return null; }

  const _turns = _entries.map(_extractCodexTurn).filter((t): t is Turn => t !== null);

  // 意味あるユーザーターンがなければスキップ
  const _firstUserTurn = _turns.find((t) => t.role === ConversationRole.user);
  if (!_firstUserTurn || isSkippableSession(_firstUserTurn.content)) { return null; }

  const _meta = await _buildCodexSessionMeta(_metaEntry, _firstUserTurn.content);
  return { meta: _meta, turns: _turns };
};

/**
 * Codex JSONL ファイルを読み込み、各行をパースしたエントリ配列を返す。
 *
 * 空行は除外し、JSON として解釈できない行は捨てる。
 *
 * @param filePath Codex JSONL ファイルの絶対パス
 * @returns パース済みエントリ配列、ファイルを読み込めない場合は `null`
 */
const _readCodexEntries = async (filePath: string): Promise<CodexEntry[] | null> => {
  let _text: string;
  try {
    _text = await readTextFile(filePath);
  } catch {
    return null;
  }
  return _text
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line): CodexEntry[] => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
};

/**
 * user テキストが Codex の自動注入コンテンツか判定する。
 *
 * 接頭辞は `CODEX_INJECTED_USER_PREFIXES`（AGENTS.md / permissions /
 * environment_context / recommended_plugins）で判定する。文中の出現は対象外。
 *
 * @param text 判定対象の user テキスト
 * @returns いずれかの接頭辞で始まる場合は `true`
 */
const _isInjectedUserText = (text: string): boolean => {
  return CODEX_INJECTED_USER_PREFIXES.some((prefix) => text.startsWith(prefix));
};

/**
 * Codex エントリ 1 件から会話ターンを抽出する。
 *
 * `response_item` かつ role が user / assistant のエントリのみを対象とし、
 * user は `input_text`、assistant は `output_text` を改行で連結してトリムする。
 * user はさらに `<user_instructions>` を除去し、空・スキップ対象・自動注入なら除外する。
 *
 * @param entry Codex JSONL のエントリ
 * @returns 抽出したターン、対象外の場合は `null`
 */
const _extractCodexTurn = (entry: CodexEntry): Turn | null => {
  if (entry.type !== 'response_item') { return null; }
  const _role = entry.payload.role;
  if (_role !== ConversationRole.user && _role !== ConversationRole.assistant) { return null; }

  const _isUser = _role === ConversationRole.user;
  const _textType = _isUser ? 'input_text' : 'output_text';
  const _text = (entry.payload.content ?? [])
    .filter((c) => c.type === _textType && c.text)
    .map((c) => c.text)
    .join('\n')
    .trim();
  if (!_text) { return null; }

  const _cleaned = _isUser ? stripUserInstructions(_text) : _text;
  if (!_cleaned) { return null; }
  if (_isUser && (isSkippable(_cleaned) || _isInjectedUserText(_cleaned))) { return null; }

  return { role: _role as ConversationRole, content: _cleaned };
};

/**
 * `session_meta` エントリからセッションメタ情報を組み立てる。
 *
 * - `sessionId`: `payload.id` を `resolveSessionId` で解決（欠落時は補完）
 * - `project`: `payload.cwd` のディレクトリ名、無ければ `'unknown'`
 * - `date`: `timestamp` の日付部分
 *
 * @param metaEntry `session_meta` エントリ
 * @param firstUserText 最初の user ターンのテキスト
 * @returns セッションメタ情報（`slug` は空文字）
 */
const _buildCodexSessionMeta = async (metaEntry: CodexEntry, firstUserText: string): Promise<SessionMeta> => {
  const _cwd = metaEntry.payload.cwd ?? '';
  return {
    sessionId: await resolveSessionId(metaEntry.payload.id),
    date: isoToDate(metaEntry.timestamp),
    project: _cwd ? getFilename(_cwd) : 'unknown',
    slug: '',
    firstUserText,
  };
};

// ─────────────────────────────────────────────
// セッションファイル探索
// ─────────────────────────────────────────────

/**
 * `~/.codex/sessions/` 配下の全 JSONL セッションファイルパスを収集する。
 *
 * `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 形式の
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
 * @param config エクスポート設定（agent, period, exportDir）
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
      // buildConfig() が常に exportDir を string に解決するため non-null。
      const outPath = await _writeSession(config.exportDir!, config.agent, session);
      outputPaths.push(outPath);
    } catch {
      errorCount++;
    }
  }

  return { exportedCount: outputPaths.length, skippedCount, errorCount, outputPaths };
};
