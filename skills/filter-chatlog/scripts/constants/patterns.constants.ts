// src: scripts/constants/patterns.constants.ts
// @(#): filter-chatlog ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// ノイズ判定パターン定数
// ─────────────────────────────────────────────

/** システム/コマンドタグとして認識するプレフィックス一覧（`startsWith` 判定用）。 */
export const SYSTEM_TAG_PREFIXES: string[] = [
  '<system-reminder',
  '<command-name',
  '<command-message',
  '<local-command-stdout',
  '<ide_opened_file',
  '<ide_selection',
  '---\n',
] as const;

/** 除外対象ファイル名パターン（文字列部分一致、`includes` 判定用）。 */
export const EXCLUDE_FILENAME_PATTERNS_STR: string[] = [
  'you-are-a-topic-and-tag-extraction-assistant',
  'say-ok-and-nothing-else',
  'command-message-claude-idd-framework',
  'command-message-deckrd-deckrd',
] as const;

/** 除外対象ファイル名パターン（正規表現、`test` 判定用）。 */
export const EXCLUDE_FILENAME_PATTERNS_RE: RegExp[] = [
  /you-are-a-topic-and-tag-extraction-assistant/i,
  /say-ok-and-nothing-else/i,
  /command-message-claude-idd-framework/i,
  /command-message-deckrd-deckrd/i,
] as const;
