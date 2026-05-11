// src: scripts/exporter/types/codex-entry.types.ts
// @(#): Codex エージェント入力型定義（JSONL エントリ）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * Codex JSONL ファイルの1行を表す入力エントリ型。
 *
 * `~/.codex/sessions/YYYY/MM/DD/*.jsonl` の各行を JSON パースした結果に対応する。
 * `parseCodexSession` が読み込み・フィルタリングに使用する。
 *
 * `type === "session_meta"` のエントリがセッション識別情報（ID・cwd）を保持し、
 * `type === "response_item"` のエントリが会話ターン本体になる。
 *
 * @see parseCodexSession
 */
export interface CodexEntry {
  /** エントリの ISO8601 タイムスタンプ（必須）。session_meta の値で期間フィルタを行う */
  timestamp: string;
  /** エントリ種別。"session_meta"（セッション情報）または "response_item"（会話ターン） */
  type: string;
  /** エントリの内容。type に応じてフィールドの意味が異なる */
  payload: {
    /**
     * session_meta 時はセッション ID。
     * `SessionMeta.sessionId` に格納される。
     */
    id?: string;
    /**
     * session_meta 時は作業ディレクトリ。
     * `SessionMeta.project` の推定に使用する。
     */
    cwd?: string;
    /** payload の詳細種別（補助フィールド） */
    type?: string;
    /** response_item 時の発話者役割。"user" または "assistant" */
    role?: string;
    /**
     * response_item 時の本文コンテンツ配列。
     * user の場合は `type === "input_text"`、assistant の場合は `type === "output_text"` を持つ。
     */
    content?: Array<{ type: string; text?: string }>;
  };
}
