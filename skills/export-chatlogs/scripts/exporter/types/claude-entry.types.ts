// src: scripts/exporter/types/claude-entry.types.ts
// @(#): Claude エージェント入力型定義（JSONL エントリ）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * Claude JSONL ファイルの1行を表す入力エントリ型。
 *
 * `~/.claude/projects/<project>/*.jsonl` の各行を JSON パースした結果に対応する。
 * `parseClaudeSession` が読み込み・フィルタリングに使用する。
 *
 * `isMeta: true` のエントリはセッションメタ情報のみを保持し、会話ターンとしては扱わない。
 * `type` が "user" または "assistant" でかつ `isMeta` が false のエントリが会話本体になる。
 *
 * @see parseClaudeSession
 * @see extractClaudeUserText
 * @see extractClaudeAssistantText
 */
export interface ClaudeEntry {
  /** エントリ種別。"user"、"assistant"、またはその他のシステムエントリ */
  type: string;
  /** true のとき会話ターンではなくメタ情報エントリとして扱い、ターン抽出でスキップする */
  isMeta?: boolean;
  /** セッションの一意識別子。全エントリで共通の値を持つ */
  sessionId?: string;
  /** エントリの ISO8601 タイムスタンプ。期間フィルタ（`inPeriod`）に使用する */
  timestamp?: string;
  /** Claude が付与するセッションスラッグ。`SessionMeta.slug` の候補として使用する */
  slug?: string;
  /** セッション開始時の作業ディレクトリ。`SessionMeta.project` の推定に使用する */
  cwd?: string;
  /** メッセージ本体。content フィールドに実際のテキストが格納される */
  message?: {
    /**
     * ストリーミング連結判定に使用するメッセージ ID。
     * 同一 ID を持つ連続 assistant エントリはテキスト連結してひとつのターンとして扱う。
     */
    id?: string;
    /**
     * メッセージの本文。文字列または構造化コンテンツ配列（`Array<{type, text, ...}>`）。
     * `extractClaudeUserText` / `extractClaudeAssistantText` が解析する。
     */
    content?: unknown;
  };
}
