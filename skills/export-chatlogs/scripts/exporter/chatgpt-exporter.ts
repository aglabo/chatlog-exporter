// src: scripts/exporter/chatgpt-exporter.ts
// @(#): ChatGPT エージェント専用のセッションエクスポート処理
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// ─── Shared modules ─────────────────────────────────────────────────────────
// error
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// libs
import { readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';
import { isoToDate } from '../../../_cle-libs/libs/text/date-utils.ts';
// constants
import { DEFAULT_CONCURRENCY } from '../../../_cle-libs/constants/defaults.constants.ts';
import { ConversationRole } from '../../../_cle-libs/types/conversation-role.const.types.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// libs
import { inPeriod, parsePeriod } from '../libs/period-filter.ts';
import { resolveSessionId, writeSession } from '../libs/session-writer.ts';
import { isSkippable, isSkippableSession } from '../libs/skip-rules.ts';
// types
import type { Turn } from '../../../_cle-libs/types/conversation.types.ts';
import type { ExportConfig } from '../types/export-config.types.ts';
import type { ExportResult } from '../types/export-result.types.ts';
import type { FileResult } from '../types/file-result.types.ts';
import type { PeriodRange } from '../types/filter.types.ts';
import type { ExportedSession, SessionMeta } from '../types/session.types.ts';
import type { ChatGPTConversation, ChatGPTMappingNode, ChatGPTMessage } from './types/chatgpt-entry.types.ts';
import type {
  FindFilesProvider,
  ParseConversationProvider,
  WriteSessionProvider,
} from './types/chatgpt-provider.types.ts';

// ─────────────────────────────────────────────
// テキスト抽出
// ─────────────────────────────────────────────

/**
 * ChatGPT メッセージオブジェクトからテキストを抽出する。
 *
 * - `null` → `''`
 * - `content_type !== 'text'` → `''`
 * - `parts` の各要素を `typeof part === 'string'` でガードして結合・トリム
 *
 * @param message ChatGPT メッセージオブジェクト、または null
 * @returns 抽出されたテキスト。抽出不能または非 text の場合は空文字列
 */
export const extractChatGPTText = (message: ChatGPTMessage | null): string => {
  if (!message) { return ''; }
  if (message.content.content_type !== 'text') { return ''; }
  const parts = message.content.parts ?? [];
  return parts
    .filter((p): p is string => typeof p === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ')
    .trim();
};

// ─────────────────────────────────────────────
// 会話トラバース
// ─────────────────────────────────────────────

/**
 * ChatGPT mapping を currentNodeId から root まで遡り、root→leaf 順のメッセージ列を返す。
 *
 * - `currentNodeId` が `mapping` に存在しない → `[]`
 * - `parent` が循環 → 訪問済みノードで遡りを打ち切る
 * - `message === null` → スキップ
 * - `message.weight === 0.0` → スキップ（`undefined` は除外しない）
 * - `author.role === 'system'` または `'tool'` → スキップ
 *
 * @param mapping ChatGPTConversation.mapping
 * @param currentNodeId 末尾ノードの ID
 * @returns root→leaf 順の ChatGPTMessage 配列
 */
export const traverseConversation = (
  mapping: Record<string, ChatGPTMappingNode>,
  currentNodeId: string,
): ChatGPTMessage[] => {
  if (!(currentNodeId in mapping)) { return []; }

  // parent を辿って root まで遡る
  const chain: ChatGPTMappingNode[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = currentNodeId;
  while (nodeId !== null) {
    if (visited.has(nodeId)) { break; }
    visited.add(nodeId);
    const node: ChatGPTMappingNode | undefined = mapping[nodeId];
    if (!node) { break; }
    chain.push(node);
    nodeId = node.parent;
  }

  // 逆順にして root→leaf 順にし、フィルタを適用
  return chain.reverse()
    .map((node) => node.message)
    .filter((msg): msg is ChatGPTMessage =>
      !!msg && msg.weight !== 0 && msg.author.role !== 'system' && msg.author.role !== 'tool'
    );
};

// ─────────────────────────────────────────────
// 会話パーサー
// ─────────────────────────────────────────────

/**
 * ChatGPT 会話オブジェクトを ExportedSession に変換する。
 *
 * 1. `conv.create_time * 1000` → ISO 文字列 → `inPeriod()` で期間フィルタ
 * 2. `current_node` 取得（なければ children が空のノードのうち最後の1件でフォールバック）
 * 3. `traverseConversation()` でメッセージ列取得
 * 4. `user | assistant` のみ Turn 変換、user には `isSkippable()` 適用
 * 5. 有効な user ターンが0件 → null
 * 6. `isSkippableSession(firstUserText)` → true なら null
 *
 * @param conv ChatGPT 会話オブジェクト
 * @param range parsePeriod() が生成した期間フィルタ
 * @returns ExportedSession または null
 */
export const parseChatGPTConversation = async (
  conv: ChatGPTConversation,
  range: PeriodRange,
): Promise<ExportedSession | null> => {
  // 期間チェック
  const _isoTimestamp = _toIsoTimestamp(conv);
  if (!inPeriod(_isoTimestamp, range)) { return null; }

  const _currentNodeId = _resolveCurrentNodeId(conv);
  if (_currentNodeId === null) { return null; }

  const _messages = traverseConversation(conv.mapping, _currentNodeId);
  const _turns = _messages.map(_toChatGPTTurn).filter((t): t is Turn => t !== null);

  // 有効な user ターンが0件、またはスキップ対象セッション → null
  const _firstUserTurn = _turns.find((t) => t.role === ConversationRole.user);
  if (!_firstUserTurn || isSkippableSession(_firstUserTurn.content)) { return null; }

  const _meta = await _buildChatGPTSessionMeta(conv, _isoTimestamp, _firstUserTurn.content);
  return { meta: _meta, turns: _turns };
};

/**
 * 会話の作成時刻（UNIX 秒）を ISO 8601 文字列に変換する。
 *
 * @param conv ChatGPT 会話オブジェクト
 * @returns `create_time` を ISO 8601 形式にした文字列
 */
const _toIsoTimestamp = (conv: ChatGPTConversation): string => {
  return new Date(conv.create_time * 1000).toISOString();
};

/**
 * トラバースの起点となる末尾ノードの ID を解決する。
 *
 * - `current_node` があればそれを返す
 * - 無ければ `children` が空のノードのうち最後の 1 件の `id` を返す
 *
 * @param conv ChatGPT 会話オブジェクト
 * @returns 末尾ノードの ID、該当ノードが無い場合は `null`
 */
const _resolveCurrentNodeId = (conv: ChatGPTConversation): string | null => {
  if (conv.current_node) { return conv.current_node; }
  const _leafNodes = Object.values(conv.mapping).filter((node) => node.children.length === 0);
  return _leafNodes.at(-1)?.id ?? null;
};

/**
 * role が会話ターンの対象（user / assistant）かを判定する型ガード。
 *
 * @param role メッセージ author の role
 * @returns `user` または `assistant` なら `true`
 */
const _isConversationRole = (role: string): role is ConversationRole =>
  role === ConversationRole.user || role === ConversationRole.assistant;

/**
 * ChatGPT メッセージ 1 件から会話ターンを抽出する。
 *
 * role が user / assistant のメッセージのみを対象とし、`extractChatGPTText` でテキストを取り出す。
 * テキストが空、または user で `isSkippable` に該当する場合は除外する。
 *
 * @param message ChatGPT メッセージオブジェクト
 * @returns 抽出したターン、対象外の場合は `null`
 */
const _toChatGPTTurn = (message: ChatGPTMessage): Turn | null => {
  const _role = message.author.role;
  if (!_isConversationRole(_role)) { return null; }

  const _text = extractChatGPTText(message);
  if (!_text) { return null; }
  if (_role === ConversationRole.user && isSkippable(_text)) { return null; }

  return { role: _role, content: _text };
};

/**
 * 会話オブジェクトからセッションメタ情報を組み立てる。
 *
 * - `sessionId`: `conversation_id` を `resolveSessionId` で解決（欠落時は補完）
 * - `date`: `isoTimestamp` の日付部分
 *
 * @param conv ChatGPT 会話オブジェクト
 * @param isoTimestamp 会話作成時刻の ISO 8601 文字列
 * @param firstUserText 最初の user ターンのテキスト
 * @returns セッションメタ情報（`slug` は空文字）
 */
const _buildChatGPTSessionMeta = async (
  conv: ChatGPTConversation,
  isoTimestamp: string,
  firstUserText: string,
): Promise<SessionMeta> => {
  return {
    sessionId: await resolveSessionId(conv.conversation_id),
    date: isoToDate(isoTimestamp),
    slug: '',
    firstUserText,
  };
};

// ─────────────────────────────────────────────
// ファイル探索
// ─────────────────────────────────────────────

/**
 * 指定ディレクトリから conversations-*.json ファイルを収集する。
 *
 * - `Deno.readDir(baseDir)` で1階層走査
 * - `/^conversations-.*\.json$/` にマッチするファイルのみ収集
 * - ソートして返す
 * - ディレクトリ不存在 (NotFound) → 空配列 / それ以外の例外 → 再スロー
 *
 * @param baseDir ChatGPT エクスポートディレクトリのパス
 * @returns ソート済みの JSON ファイルパス配列
 */
export const findChatGPTFiles = async (baseDir: string): Promise<string[]> => {
  const results: string[] = [];
  try {
    for await (const entry of Deno.readDir(baseDir)) {
      if (entry.isFile && /^conversations-.*\.json$/.test(entry.name)) {
        results.push(`${baseDir}/${entry.name}`);
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) { throw e; }
    return [];
  }
  return results.sort();
};

// ─────────────────────────────────────────────
// ファイル単位処理・集約
// ─────────────────────────────────────────────

/**
 * conversations-*.json の1ファイルを読み込み、全会話をパース・書き出しする。
 *
 * - ファイル読み込み失敗 → `{ errorCount: 1 }` を返す（例外を伝播させない）
 * - 配列でない JSON → `{ errorCount: 1 }` を返す
 * - 各会話のパース/書き込みエラー → `errorCount++` して継続
 * - parse が null → `skippedCount++` して継続
 *
 * @param file 対象ファイルパス
 * @param range 期間フィルタ
 * @param outputDir 出力先ディレクトリ
 * @param agent エージェント名
 * @param parseConversation パーサー Provider
 * @param writeSession 書き出し Provider
 * @returns 部分的な FileResult（マージ用）
 */
const _processFile = async (
  file: string,
  range: PeriodRange,
  outputDir: string,
  agent: string,
  parseConversation: ParseConversationProvider,
  writeSession: WriteSessionProvider,
): Promise<FileResult> => {
  let conversations: ChatGPTConversation[];
  try {
    const text = await readTextFile(file);
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { outputPaths: [], skippedCount: 0, errorCount: 1 };
    }
    conversations = parsed as ChatGPTConversation[];
  } catch {
    return { outputPaths: [], skippedCount: 0, errorCount: 1 };
  }

  const outputPaths: string[] = [];
  let skippedCount = 0;
  let errorCount = 0;

  for (const conv of conversations) {
    try {
      const session = await parseConversation(conv, range);
      if (!session) {
        skippedCount++;
        continue;
      }
      const outPath = await writeSession(outputDir, agent, session);
      outputPaths.push(outPath);
    } catch {
      errorCount++;
    }
  }

  return { outputPaths, skippedCount, errorCount };
};

/**
 * 複数の FileResult を1つの ExportResult にマージする。
 *
 * @param results _processFile が返した FileResult の配列
 * @returns マージ済み ExportResult
 */
const _mergeResults = (results: FileResult[]): ExportResult => {
  const outputPaths = results.flatMap((r) => r.outputPaths);
  const skippedCount = results.reduce((sum, r) => sum + r.skippedCount, 0);
  const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);

  return { exportedCount: outputPaths.length, skippedCount, errorCount, outputPaths };
};

// ─────────────────────────────────────────────
// オーケストレーション
// ─────────────────────────────────────────────

/**
 * ChatGPT エージェントのセッション履歴をエクスポートするオーケストレーション関数。
 *
 * 処理フロー:
 * 1. `config.inputDir` が undefined → エラースロー
 * 2. `parsePeriod(config.period)` で PeriodRange 取得
 * 3. `findFiles()` でファイル一覧を収集
 * 4. 全ファイルを `runConcurrent()` で `config.concurrency` 件ずつ並列処理（各ファイルは独立して読み込み・パース・書き出し）
 * 5. 各ファイルの結果をマージして返す
 *
 * `_providers` を省略した場合は実際のファイルシステム操作を行う。
 * テスト時は `_providers` に差し替え実装を渡すことで I/O なしに動作を検証できる。
 *
 * @param config エクスポート設定（agent, period, exportDir, inputDir）
 * @param _providers テスト用 Provider（省略時は実実装を使用）
 * @returns エクスポート結果（exportedCount, skippedCount, errorCount, outputPaths）
 */
export const exportChatGPT = async (
  config: ExportConfig,
  _providers?: {
    findFiles?: FindFilesProvider;
    parseConversation?: ParseConversationProvider;
    writeSession?: WriteSessionProvider;
  },
): Promise<ExportResult> => {
  const inputDir = config.inputDir;
  if (!inputDir) {
    throw new ChatlogError(
      'MissingArg',
      'NotSpecified',
      'ChatGPT エクスポートには --input-dir でディレクトリを指定してください',
    );
  }

  const range = parsePeriod(config.period);

  const _findFiles = _providers?.findFiles ?? findChatGPTFiles;
  const _parseConversation = _providers?.parseConversation ?? parseChatGPTConversation;
  const _writeSession = _providers?.writeSession ?? writeSession;

  const files = await _findFiles(inputDir);

  const results = await runConcurrent(
    files,
    // buildConfig() が常に exportDir を string に解決するため non-null。
    (file) => _processFile(file, range, config.exportDir!, config.agent, _parseConversation, _writeSession),
    config.concurrency ?? DEFAULT_CONCURRENCY,
  );

  return _mergeResults(results);
};
