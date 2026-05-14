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
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// libs
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { isoToDate } from '../../../_scripts/libs/text/date-utils.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// libs
import { inPeriod, parsePeriod } from '../libs/period-filter.ts';
import { writeSession } from '../libs/session-writer.ts';
import { isSkippable, isSkippableSession } from '../libs/skip-rules.ts';
// types
import type { ExportConfig } from '../types/export-config.types.ts';
import type { ExportResult } from '../types/export-result.types.ts';
import type { FileResult } from '../types/file-result.types.ts';
import type { PeriodRange } from '../types/filter.types.ts';
import type { ExportedSession, SessionMeta, Turn } from '../types/session.types.ts';
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
  let nodeId: string | null = currentNodeId;
  while (nodeId !== null) {
    const node: ChatGPTMappingNode | undefined = mapping[nodeId];
    if (!node) { break; }
    chain.push(node);
    nodeId = node.parent;
  }

  // 逆順にして root→leaf 順にし、フィルタを適用
  chain.reverse();
  const messages: ChatGPTMessage[] = [];
  for (const node of chain) {
    const msg = node.message;
    if (!msg) { continue; }
    if (msg.weight === 0) { continue; }
    if (msg.author.role === 'system' || msg.author.role === 'tool') { continue; }
    messages.push(msg);
  }
  return messages;
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
export const parseChatGPTConversation = (
  conv: ChatGPTConversation,
  range: PeriodRange,
): ExportedSession | null => {
  // 期間チェック
  const isoTimestamp = new Date(conv.create_time * 1000).toISOString();
  if (!inPeriod(isoTimestamp, range)) { return null; }

  // current_node の取得（フォールバック: children が空のノードの最後）
  let currentNodeId = conv.current_node;
  if (!currentNodeId) {
    const leafNodes = Object.values(conv.mapping).filter(
      (node) => node.children.length === 0,
    );
    if (leafNodes.length === 0) { return null; }
    currentNodeId = leafNodes[leafNodes.length - 1].id;
  }

  // メッセージ列取得
  const messages = traverseConversation(conv.mapping, currentNodeId);

  // Turn 変換
  const turns: Turn[] = [];
  for (const msg of messages) {
    const role = msg.author.role;
    if (role !== 'user' && role !== 'assistant') { continue; }
    const text = extractChatGPTText(msg);
    if (!text) { continue; }
    if (role === 'user' && isSkippable(text)) { continue; }
    turns.push({ role: role as 'user' | 'assistant', text });
  }

  // 有効な user ターンが0件 → null
  const firstUserTurn = turns.find((t) => t.role === 'user');
  if (!firstUserTurn) { return null; }
  if (isSkippableSession(firstUserTurn.text)) { return null; }

  const meta: SessionMeta = {
    sessionId: conv.conversation_id,
    date: isoToDate(isoTimestamp),
    project: conv.title,
    slug: '',
    firstUserText: firstUserTurn.text,
  };

  return { meta, turns };
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
 * - ディレクトリ不存在 → 空配列（try/catch）
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
  } catch {
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
    conversations = JSON.parse(text) as ChatGPTConversation[];
  } catch {
    return { outputPaths: [], skippedCount: 0, errorCount: 1 };
  }

  const outputPaths: string[] = [];
  let skippedCount = 0;
  let errorCount = 0;

  for (const conv of conversations) {
    try {
      const session = parseConversation(conv, range);
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
  const outputPaths: string[] = [];
  let skippedCount = 0;
  let errorCount = 0;

  for (const r of results) {
    outputPaths.push(...r.outputPaths);
    skippedCount += r.skippedCount;
    errorCount += r.errorCount;
  }

  return { exportedCount: outputPaths.length, skippedCount, errorCount, outputPaths };
};

// ─────────────────────────────────────────────
// オーケストレーション
// ─────────────────────────────────────────────

/**
 * ChatGPT エージェントのセッション履歴をエクスポートするオーケストレーション関数。
 *
 * 処理フロー:
 * 1. `config.inputDir ?? config.baseDir` が undefined → エラースロー
 * 2. `parsePeriod(config.period)` で PeriodRange 取得
 * 3. `findFiles()` でファイル一覧を収集
 * 4. 全ファイルを Promise.all で並列処理（各ファイルは独立して読み込み・パース・書き出し）
 * 5. 各ファイルの結果をマージして返す
 *
 * `_providers` を省略した場合は実際のファイルシステム操作を行う。
 * テスト時は `_providers` に差し替え実装を渡すことで I/O なしに動作を検証できる。
 *
 * @param config エクスポート設定（agent, period, outputDir, inputDir, baseDir）
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
  const inputDir = config.inputDir ?? config.baseDir;
  if (!inputDir) {
    throw new ChatlogError(
      'MissingArg',
      'InputDir',
      'ChatGPT エクスポートには --input/--base でディレクトリを指定してください',
    );
  }

  const range = parsePeriod(config.period);

  const _findFiles = _providers?.findFiles ?? findChatGPTFiles;
  const _parseConversation = _providers?.parseConversation ?? parseChatGPTConversation;
  const _writeSession = _providers?.writeSession ?? writeSession;

  const files = await _findFiles(inputDir);

  const results = await Promise.all(
    files.map((file) => _processFile(file, range, config.outputDir, config.agent, _parseConversation, _writeSession)),
  );

  return _mergeResults(results);
};
