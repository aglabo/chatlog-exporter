// src: scripts/constants/patterns/assistant.constants.ts
// @(#): filter-chatlogs Assistantレスポンスノイズ判定パターン定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// constants
import { ConversationRole } from '../../../../_cle-libs/types/conversation-role.const.types.ts';

// ─── internal ───
// constants
import { ENTRY_CONTROL } from '../../types/patterns.types.ts';

// types
import type { NoiseConversationPattern } from '../../types/patterns.types.ts';

/**
 * システムタグのみと判断するプレフィックス正規表現。
 *
 * `INSTRUCTIONS` は Codex が常に大文字で出力するため、`i` フラグは付けずリテラルで列挙する。
 */
export const SYSTEM_TAG_REGEX =
  /^<(system-reminder|command-name|command-message|local-command-stdout|ide_opened_file|ide_selection|recommended_plugins|INSTRUCTIONS|environment_context)\b/;

/** Assistantの応答内容によるノイズパターン。checkAssistantContent() で使用。 */
export const NOISE_ASSISTANT_PATTERNS: NoiseConversationPattern[] = [
  {
    label: 'Assistant定型肯定応答のみ',
    entries: [{
      target: ConversationRole.assistant,
      pattern: /^(ok|okay|了解|はい|yes|done|sure|承知しました|かしこまりました)[\s。.!！]*$/i,
    }],
  },
  {
    label: 'AssistantがJSONのみ返却',
    entries: [{
      target: ConversationRole.assistant,
      pattern: /^\s*[\[{][\s\S]*[\]}]\s*$/,
    }],
  },
  {
    label: 'Assistantがコードブロックのみ',
    entries: [{
      target: ConversationRole.assistant,
      pattern: /^```[\w]*\n[\s\S]*\n```\s*$/,
    }],
  },
  {
    label: 'PR生成作業ログ',
    entries: [
      { target: ConversationRole.assistant, control: ENTRY_CONTROL.SKIP },
      { target: ConversationRole.assistant, pattern: /\*\*生成されたPRドラフト\*\*/ },
    ],
  },
  {
    label: 'PR生成作業ログ',
    entries: [
      { target: ConversationRole.assistant, control: ENTRY_CONTROL.SKIP },
      { target: ConversationRole.assistant, control: ENTRY_CONTROL.SKIP },
      { target: ConversationRole.assistant, pattern: /\*\*生成されたPRドラフト\*\*/ },
    ],
  },
  {
    label: 'PRドラフト生成作業ログ',
    entries: [
      { target: ConversationRole.assistant, pattern: /^PRドラフトを生成/ },
    ],
  },
];
