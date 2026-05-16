// src: scripts/constants/patterns.constants.ts
// @(#): filter-chatlogs ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ENTRY_CONTROL } from '../types/patterns.types.ts';
import type { NoiseConversationPattern } from '../types/patterns.types.ts';

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
// prefilter-chatlogs ノイズ判定パターン
// ─────────────────────────────────────────────

/** prefilter-chatlogs のファイル名除外正規表現パターン一覧。 */
export const NOISE_FILENAME_PATTERNS: RegExp[] = [
  /you-are-a-topic-and-tag-extraction-assistant/,
  /say-ok-and-nothing-else/,
  /command-message-claude-idd-framework/,
  /command-message-deckrd-deckrd/,
  /command-message-deckrd-coder/,
];

/** chatlog-exporter スラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_CHATLOG: NoiseConversationPattern[] = [
  {
    label: 'chatlog-exporterコマンドのみ',
    entries: [{
      target: 'user',
      pattern: /^\/(export-log|export-chatlogs|filter-chatlogs|set-frontmatter|classify-chatlogs|normalize-chatlogs)\b/,
    }],
  },
];

/** 外部システムスラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_EXTERNAL: NoiseConversationPattern[] = [
  {
    label: '外部システムコマンドのみ',
    entries: [{
      target: 'user',
      pattern: /^\/(deckrd|idd)\b/,
    }],
  },
];

/** 汎用スラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_GENERIC: NoiseConversationPattern[] = [
  {
    label: '汎用スラッシュコマンドのみ',
    entries: [{
      target: 'user',
      pattern: /^\/(commit|clear|help)\b/,
    }],
  },
];

/** User 入力形式パターン（コマンド・パスのみなど単純入力）。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS: NoiseConversationPattern[] = [
  ...NOISE_USER_PATTERNS_CHATLOG,
  ...NOISE_USER_PATTERNS_EXTERNAL,
  ...NOISE_USER_PATTERNS_GENERIC,
  {
    label: 'Windowsパスのみ',
    entries: [{ target: 'user', pattern: /^[A-Za-z]:\\[^\n]{0,300}$/ }],
  },
  {
    label: 'Unixパスのみ',
    entries: [{ target: 'user', pattern: /^(?:docs|temp|scripts|src|tests?|\.github)\/[^\n]{0,300}$/ }],
  },
];

/** システムが生成する定型・コマンドプロンプトパターン。checkConversationPattern() で使用。 */
export const NOISE_CONVERSATION_PATTERNS: NoiseConversationPattern[] = [
  {
    label: 'Git操作ログのみ',
    entries: [{ target: 'user', pattern: /^={3,}\s*git\s+(logs?|diff|diffs?)\s*={3,}/i }],
  },
  {
    label: 'スキル呼び出し(YAML)',
    entries: [{ target: 'user', pattern: /^---\s*\nname\s*:/i }],
  },
  {
    label: 'deckrd実装指示',
    entries: [{ target: 'user', pattern: /^implement the following plan\b/i }],
  },
  {
    label: 'deckrd実装指示(日本語)',
    entries: [{ target: 'user', pattern: /^以下のプランを実装/i }],
  },
  {
    label: 'プロンプトテスト',
    entries: [{ target: 'user', pattern: /^={3,}\s*prompt\s*={3,}/i }],
  },
];

/** AIへの定型プロンプト・システムプロンプト転写パターン。checkPromptContent() で使用。 */
export const NOISE_PROMPT_PATTERNS: NoiseConversationPattern[] = [
  {
    label: '定型プロンプト(タイトル説明生成)',
    entries: [{ target: 'user', pattern: /^以下のタイトルに対して、\d+-\d+文字程度の.*?説明を.*?生成してください/s }],
  },
  {
    label: '定型プロンプト(commit/issue/branch判定)',
    entries: [{ target: 'user', pattern: /^以下の情報から、最適なcommit種別.*?json形式で返してください/is }],
  },
  {
    label: '定型プロンプト(GitHub Issue生成)',
    entries: [{
      target: 'user',
      pattern: /^以下のjson形式パラメータから、github\s+issue下書きをmarkdown形式で生成してください/i,
    }],
  },
  {
    label: '定型プロンプト(branch名生成)',
    entries: [{ target: 'user', pattern: /^based on the issue title\b/i }],
  },
  {
    label: '定型プロンプト(英語翻訳)',
    entries: [{ target: 'user', pattern: /^translate the following text to english for use in/i }],
  },
  {
    label: '定型プロンプト(要約生成)',
    entries: [{ target: 'user', pattern: /^summarize the following.*?in \d+ words/i }],
  },
  {
    label: 'システムプロンプト転写',
    entries: [{
      target: 'user',
      pattern: /^you are a (topic and tag extraction assistant|log curator)\b/i,
    }],
  },
];

/** システムタグのみと判断するプレフィックス正規表現。 */
export const SYSTEM_TAG_REGEX =
  /^<(system-reminder|command-name|command-message|local-command-stdout|ide_opened_file|ide_selection)\b/;

/** Assistantの応答内容によるノイズパターン。checkAssistantContent() で使用。 */
export const NOISE_ASSISTANT_PATTERNS: NoiseConversationPattern[] = [
  {
    label: 'Assistant定型肯定応答のみ',
    entries: [{
      target: 'assistant',
      pattern: /^(ok|okay|了解|はい|yes|done|sure|承知しました|かしこまりました)[\s。.!！]*$/i,
    }],
  },
  {
    label: 'AssistantがJSONのみ返却',
    entries: [{
      target: 'assistant',
      pattern: /^\s*[\[{][\s\S]*[\]}]\s*$/,
    }],
  },
  {
    label: 'Assistantがコードブロックのみ',
    entries: [{
      target: 'assistant',
      pattern: /^```[\w]*\n[\s\S]*\n```\s*$/,
    }],
  },
  {
    label: 'PR生成作業ログ',
    entries: [
      { target: 'assistant', control: ENTRY_CONTROL.SKIP },
      { target: 'assistant', control: ENTRY_CONTROL.SKIP },
      { target: 'assistant', pattern: /\*\*生成されたPRドラフト\*\*/ },
    ],
  },
];
