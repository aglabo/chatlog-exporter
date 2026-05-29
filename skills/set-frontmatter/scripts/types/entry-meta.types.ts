// src: scripts/types/entry-meta.types.ts
// @(#): set-frontmatter エントリメタ型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// エントリメタ型
// ─────────────────────────────────────────────

/** 1ファイル分の処理対象メタデータ。`loadEntryMeta` がファイルパスから生成する。 */
export interface EntryMeta {
  /** 対象ファイルのフルパス。 */
  file: string;
  /** ファイル名から抽出したセッション ID。 */
  sessionId: string;
  /** ファイル名から抽出した日付文字列（`YYYY-MM-DD` 形式）。 */
  date: string;
  /** ファイルが属するプロジェクト名（親ディレクトリ名）。 */
  project: string;
  /** ファイル名から生成したスラッグ。 */
  slug: string;
  /** AI に渡す本文（`MAX_BODY_CHARS` 文字でトリミング済み）。 */
  content: string;
  /** 書き込み用の本文全体（文字数制限なし）。 */
  fullBody: string;
}
