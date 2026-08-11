// src: scripts/constants/patterns/filename.constants.ts
// @(#): filter-chatlogs ファイル名ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * システム/コマンドタグとして認識するプレフィックス一覧（`startsWith` 判定用）。
 *
 * ここに列挙するタグは「先頭に現れればターン全体がシステム入力」とみなせるものに限る。
 * Codex が会話冒頭に注入する `recommended_plugins` 等は本題が後続しうるため、
 * 前方一致ではなくターン全体を見る `isPreambleTurn` で判定する。
 */
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
  'temp-idd-pr-pr-current-draft',
];

/**
 * ファイル名ノイズ判定の正規表現専用パターン一覧（非公開）。
 *
 * 文字列部分一致では正当なログを誤除外するため、アンカー付き正規表現で表現する必要があるものを置く。
 * `EXCLUDE_FILENAME_PATTERNS_STR`（`includes` 判定用）には含めない。
 */
const _REGEXP_ONLY_FILENAME_PATTERNS: RegExp[] = [
  // Codex プリアンブル断片がそのままタイトル化したログ。
  // session-writer の `<date>-<slug>-<hash>.md` 形式でスラッグ全体が
  // `recommended-plugins` である場合のみ一致させる（判定前に小文字化済み）。
  // 例: 2026-07-30-recommended-plugins-cfa0110de248.md → 一致
  //     2026-08-11-which-recommended-plugins-should-i-install-abc123.md → 不一致
  /^\d{4}-\d{2}-\d{2}-recommended-plugins-[0-9a-f]+\.md$/,
];

/** 除外対象ファイル名パターン（文字列部分一致、`includes` 判定用）。 */
export const EXCLUDE_FILENAME_PATTERNS_STR: string[] = [..._BASE_FILENAME_PATTERNS];

/** noise-filter-chatlogs のファイル名除外正規表現パターン一覧。 */
export const NOISE_FILENAME_PATTERNS: RegExp[] = [
  ..._BASE_FILENAME_PATTERNS.map((p) => new RegExp(p)),
  ..._REGEXP_ONLY_FILENAME_PATTERNS,
];
