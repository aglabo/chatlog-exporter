// src: scripts/constants/patterns/filename.constants.ts
// @(#): filter-chatlogs ファイル名ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

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

/** ファイル名ノイズ判定の基本パターン文字列一覧（非公開）。派生定数の共通ソース。 */
const _BASE_FILENAME_PATTERNS: string[] = [
  'you-are-a-topic-and-tag-extraction-assistant',
  'say-ok-and-nothing-else',
  'command-message-claude-idd-framework',
  'command-message-deckrd-deckrd',
  'command-message-deckrd-coder',
  'pr-temp-idd-pr',
];

/** 除外対象ファイル名パターン（文字列部分一致、`includes` 判定用）。 */
export const EXCLUDE_FILENAME_PATTERNS_STR: string[] = [..._BASE_FILENAME_PATTERNS];

/** prefilter-chatlogs のファイル名除外正規表現パターン一覧。 */
export const NOISE_FILENAME_PATTERNS: RegExp[] = _BASE_FILENAME_PATTERNS.map((p) => new RegExp(p));
