// src: scripts/libs/batch-prompt.ts
// @(#): Claude CLI へのバッチプロンプト文字列構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// functions
import { buildConversationEntries } from '../../../_scripts/libs/ai/prompt-utils.ts';
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';

// ─── internal ───
// constants
import { MAX_BODY_CHARS } from '../constants/common.constants.ts';

// ─────────────────────────────────────────────
// バッチプロンプト構築
// ─────────────────────────────────────────────

export const buildBatchPrompt = async (files: string[]): Promise<string> => {
  if (files.length === 0) { return ''; }
  const _entries = await Promise.all(
    files.map(async (filePath) => {
      const text = await readTextFile(filePath);
      return new ChatlogEntry(text, { filePath });
    }),
  );
  return buildConversationEntries(_entries, MAX_BODY_CHARS);
};
