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

// ─────────────────────────────────────────────
// prefilter-chatlog ノイズ判定パターン
// ─────────────────────────────────────────────

/** prefilter-chatlog のファイル名除外正規表現パターン一覧。 */
export const NOISE_FILENAME_PATTERNS: RegExp[] = [
  /you-are-a-topic-and-tag-extraction-assistant/,
  /say-ok-and-nothing-else/,
  /command-message-claude-idd-framework/,
  /command-message-deckrd-deckrd/,
  /command-message-deckrd-coder/,
];

/** User 本文の先頭に一致すれば除外するパターン一覧（`i` フラグで大文字小文字無視）。 */
export const NOISE_USER_PREFIX_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Git操作ログ（GIT LOGS / GIT DIFF / END DIFF）
  { pattern: /^={3,}\s*git\s+(logs?|diff|diffs?)\s*={3,}/i, label: 'Git操作ログのみ' },

  // スキル呼び出し（YAML先頭 ---\nname: で始まるもの）
  { pattern: /^---\s*\nname\s*:/i, label: 'スキル呼び出し(YAML)' },

  // idd-framework 定型APIプロンプト
  {
    pattern: /^以下のタイトルに対して、\d+-\d+文字程度の.*?説明を.*?生成してください/s,
    label: '定型プロンプト(タイトル説明生成)',
  },
  {
    pattern: /^以下の情報から、最適なcommit種別.*?json形式で返してください/is,
    label: '定型プロンプト(commit/issue/branch判定)',
  },
  {
    pattern: /^以下のjson形式パラメータから、github\s+issue下書きをmarkdown形式で生成してください/i,
    label: '定型プロンプト(GitHub Issue生成)',
  },
  { pattern: /^based on the issue title\b/i, label: '定型プロンプト(branch名生成)' },
  { pattern: /^translate the following text to english for use in/i, label: '定型プロンプト(英語翻訳)' },
  { pattern: /^summarize the following.*?in \d+ words/i, label: '定型プロンプト(要約生成)' },

  // deckrd 実装指示
  { pattern: /^implement the following plan\b/i, label: 'deckrd実装指示' },
  { pattern: /^以下のプランを実装/i, label: 'deckrd実装指示(日本語)' },

  // プロンプトテスト系
  { pattern: /^={3,}\s*prompt\s*={3,}/i, label: 'プロンプトテスト' },
  { pattern: /^you are a (topic and tag extraction assistant|log curator)\b/i, label: 'システムプロンプト転写' },

  // スラッシュコマンド転写
  {
    pattern:
      /^\/(export-log|filter-chatlog|commit|idd|deckrd|clear|help|set-frontmatter|classify-chatlog|classify-chatlogs)\b/,
    label: 'スラッシュコマンドのみ',
  },
];

/** User 本文の全体に一致すれば除外するパターン一覧。 */
export const NOISE_USER_EXACT_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Windowsパスのみ（1行）
  { pattern: /^[A-Za-z]:\\[^\n]{0,300}$/, label: 'Windowsパスのみ' },
  // Unixパスのみ（1行）
  { pattern: /^(?:docs|temp|scripts|src|tests?|\.github)\/[^\n]{0,300}$/, label: 'Unixパスのみ' },
];

/** システムタグのみと判断するプレフィックス正規表現。 */
export const SYSTEM_TAG_PATTERN =
  /^<(system-reminder|command-name|command-message|local-command-stdout|ide_opened_file|ide_selection)\b/;
