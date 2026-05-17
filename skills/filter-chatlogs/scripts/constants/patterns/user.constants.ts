// src: scripts/constants/patterns/user.constants.ts
// @(#): filter-chatlogs User入力ノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// constants
import { ConversationRole } from '../../../../_scripts/types/conversation-role.const.types.ts';

// ─── internal ───
// types
import type { NoiseConversationPattern } from '../../types/patterns.types.ts';

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
