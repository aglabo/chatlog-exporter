// src: scripts/constants/patterns/conversation.constants.ts
// @(#): filter-chatlogs 会話パターンノイズ判定定数
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

/** システムが生成する定型・コマンドプロンプトパターン。checkConversationPattern() で使用。 */
export const NOISE_CONVERSATION_PATTERNS: NoiseConversationPattern[] = [
  {
    label: 'Git操作ログのみ',
    entries: [{ target: ConversationRole.user, pattern: /^={3,}\s*git\s+(logs?|diff|diffs?)\s*={3,}/i }],
  },
  {
    label: 'スキル呼び出し(YAML)',
    entries: [{ target: ConversationRole.user, pattern: /^---\s*\nname\s*:/i }],
  },
  {
    label: 'deckrd実装指示',
    entries: [{ target: ConversationRole.user, pattern: /^implement the following plan\b/i }],
  },
  {
    label: 'deckrd実装指示(日本語)',
    entries: [{ target: ConversationRole.user, pattern: /^以下のプランを実装/i }],
  },
  {
    label: 'プロンプトテスト',
    entries: [{ target: ConversationRole.user, pattern: /^={3,}\s*prompt\s*={3,}/i }],
  },
];
