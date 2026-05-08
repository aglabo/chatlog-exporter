// src: scripts/libs/batch-prompt.ts
// @(#): Claude CLI へのバッチプロンプト文字列構築
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { parseFrontmatterEntries } from '../../../_scripts/libs/text/frontmatter-utils.ts';

// ─── internal ───
import { MAX_BODY_CHARS } from '../constants/filter.constants.ts';
import { extractBodyText } from './prefilter.ts';

// ─────────────────────────────────────────────
// バッチプロンプト構築
// ─────────────────────────────────────────────

export const buildBatchPrompt = async (files: string[]): Promise<string> => {
  const parts: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = filePath.split(/[/\\]/).pop()!;
    const text = await readTextFile(filePath);
    const { content } = parseFrontmatterEntries(text);
    const bodyText = extractBodyText(content, MAX_BODY_CHARS);

    parts.push(`=== FILE ${i + 1}: ${filename} ===\n${bodyText}`);
  }

  return parts.join('\n\n');
};
