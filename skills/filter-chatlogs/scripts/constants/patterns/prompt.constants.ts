// src: scripts/constants/patterns/prompt.constants.ts
// @(#): filter-chatlogs 定型プロンプトノイズ判定パターン定数
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

/** AIへの定型プロンプト・システムプロンプト転写パターン。checkPromptContent() で使用。 */
export const NOISE_PROMPT_PATTERNS: NoiseConversationPattern[] = [
  {
    label: '定型プロンプト(タイトル説明生成)',
    entries: [{
      target: ConversationRole.user,
      pattern: /^以下のタイトルに対して、\d+-\d+文字程度の.*?説明を.*?生成してください/s,
    }],
  },
  {
    label: '定型プロンプト(commit/issue/branch判定)',
    entries: [{
      target: ConversationRole.user,
      pattern: /^以下の情報から、最適なcommit種別.*?json形式で返してください/is,
    }],
  },
  {
    label: '定型プロンプト(GitHub Issue生成)',
    entries: [{
      target: ConversationRole.user,
      pattern: /^以下のjson形式パラメータから、github\s+issue下書きをmarkdown形式で生成してください/i,
    }],
  },
  {
    label: '定型プロンプト(branch名生成)',
    entries: [{ target: ConversationRole.user, pattern: /^based on the issue title\b/i }],
  },
  {
    label: '定型プロンプト(英語翻訳)',
    entries: [{ target: ConversationRole.user, pattern: /^translate the following text to english for use in/i }],
  },
  {
    label: '定型プロンプト(要約生成)',
    entries: [{ target: ConversationRole.user, pattern: /^summarize the following.*?in \d+ words/i }],
  },
  {
    label: 'システムプロンプト転写',
    entries: [{
      target: ConversationRole.user,
      pattern: /^you are a (topic and tag extraction assistant|log curator)\b/i,
    }],
  },
];
