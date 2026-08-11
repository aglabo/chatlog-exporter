// src: scripts/constants/patterns/user.constants.ts
// @(#): filter-chatlogs User入力ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// constants
import { ConversationRole } from '../../../../_cle-libs/types/conversation-role.const.types.ts';

// ─── internal ───
// types
import type { NoiseConversationPattern } from '../../types/patterns.types.ts';

/**
 * プリアンブル判定で開閉ペアごと除去するタグ名一覧（非公開）。派生定数の共通ソース。
 *
 * Codex が会話冒頭に自動注入するタグ。内部に任意の Markdown を含むため、
 * 行単位ではなく `<tag>` 〜 `</tag>` の領域ごと除去する。
 */
const _PREAMBLE_TAG_NAMES: string[] = [
  'recommended_plugins',
  'INSTRUCTIONS',
  'environment_context',
];

/** プリアンブルタグブロックを開閉ペアごと除去する正規表現一覧。 */
export const PREAMBLE_BLOCK_PATTERNS: RegExp[] = _PREAMBLE_TAG_NAMES.map(
  (tag) => new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'),
);

/**
 * タグブロック除去後に残る定型行のパターン一覧。
 *
 * Codex がプリアンブルに含める裸の見出し。これらのみが残る場合もプリアンブルとみなす。
 */
export const PREAMBLE_RESIDUE_PATTERNS: RegExp[] = [
  /^#\s+AGENTS\.md\s+instructions\s+for\s+\S.*$/,
];

/** chatlog-exporter スラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_CHATLOG: NoiseConversationPattern[] = [
  {
    label: 'chatlog-exporterコマンドのみ',
    entries: [{
      target: ConversationRole.user,
      pattern: /^\/(export-log|export-chatlogs|filter-chatlogs|set-frontmatter|classify-chatlogs|normalize-chatlogs)\b/,
    }],
  },
];

/** 外部システムスラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_EXTERNAL: NoiseConversationPattern[] = [
  {
    label: '外部システムコマンドのみ',
    entries: [{
      target: ConversationRole.user,
      pattern: /^\/(deckrd|idd)\b/,
    }],
  },
];

/** 汎用スラッシュコマンドパターン。checkUserContent() で使用。 */
export const NOISE_USER_PATTERNS_GENERIC: NoiseConversationPattern[] = [
  {
    label: '汎用スラッシュコマンドのみ',
    entries: [{
      target: ConversationRole.user,
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
    entries: [{ target: ConversationRole.user, pattern: /^[A-Za-z]:\\[^\n]{0,300}$/ }],
  },
  {
    label: 'Unixパスのみ',
    entries: [{ target: ConversationRole.user, pattern: /^(?:docs|temp|scripts|src|tests?|\.github)\/[^\n]{0,300}$/ }],
  },
];
