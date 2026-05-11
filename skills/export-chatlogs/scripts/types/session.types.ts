// src: scripts/types/session.ts
// @(#): セッションのドメインモデル型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * 会話の1ターンを表す。役割（user/assistant）と本文テキストを持つ。
 *
 * `parseClaudeSession` および `parseCodexSession` が JSONL エントリから生成し、
 * `renderMarkdown` が Markdown の `### User` / `### Assistant` セクションとして出力する。
 * スキップ対象テキスト（短文肯定・システムメッセージ等）は含まれない。
 */
export interface Turn {
  /** 発話者の役割。"user" または "assistant" */
  role: 'user' | 'assistant';
  /** 発話のテキスト本文。スキップ対象テキストは含まれない */
  text: string;
}

/**
 * エクスポートセッションのメタ情報。
 *
 * パーサー関数（`parseClaudeSession`, `parseCodexSession`）が JSONL から抽出し、
 * `buildOutputPath` が出力パスの生成に、`renderMarkdown` が YAML フロントマターの
 * 生成にそれぞれ使用する。
 */
export interface SessionMeta {
  /** セッションの一意識別子。出力ファイル名のハッシュ部分（先頭8文字）に使用する */
  sessionId: string;
  /** セッション開始日（YYYY-MM-DD 形式）。出力パスの年/月ディレクトリに使用する */
  date: string; // YYYY-MM-DD
  /** セッション開始時の作業ディレクトリ名（末尾セグメント）。フロントマターの project フィールドになる */
  project: string;
  /** セッションのスラッグ文字列。Claude の場合は JSONL から取得し、Codex の場合は空文字列 */
  slug: string;
  /** 最初の意味あるユーザーメッセージ。Markdown の H1 見出しおよびスラッグ生成に使用する */
  firstUserText: string;
}

/**
 * エクスポート済みセッションのドメインモデル。パーサーの最終出力型。
 *
 * `parseClaudeSession` および `parseCodexSession` が返し、
 * `writeSession` が Markdown ファイルとして書き出す。
 */
export interface ExportedSession {
  /** セッションのメタ情報（ID・日付・プロジェクト・スラッグ等） */
  meta: SessionMeta;
  /** スキップフィルタ済みの会話ターン一覧（user/assistant 交互） */
  turns: Turn[];
}
