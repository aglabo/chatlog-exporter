// src: scripts/__tests__/_helpers/classify-test-helpers.ts
// @(#): classify-chatlogs テスト共通ヘルパー
//       ChatlogEntry・ClassifyStats の生成ヘルパー関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Helpers
import { ChatlogEntry } from '../../../../_scripts/classes/ChatlogEntry.class.ts';
import { renderFrontmatter } from '../../../../_scripts/libs/text/frontmatter-utils.ts';
import type { ClassifyStats } from '../../types/classify.types.ts';

// ─── Exports

/** 初期化済みの `ClassifyStats` を返す。 */
export const _makeStats = (): ClassifyStats => ({ moved: 0, movedByAI: 0, skipped: 0, error: 0, remaining: 0 });

/**
 * テスト用 `ChatlogEntry` をファイル名から生成する。
 *
 * @param filename - ファイル名（例: `a.md`）
 * @param entryText - エントリテキスト。省略時は標準の frontmatter 付きテキストを使用する。
 * @returns 初期化済みの `ChatlogEntry` インスタンス（`filePath` は `/tmp/input/{filename}`）
 */
export const _makeClassifyChatlogEntry = (filename: string, entryText?: string): ChatlogEntry => {
  const text = entryText
    ?? `---\ntitle: Test Title\ncategory: development\ntopics:\n  - API\ntags:\n  - typescript\n---\n本文`;
  return new ChatlogEntry(text, { filePath: `/tmp/input/${filename}` });
};

/**
 * テスト用 `ChatlogEntry` を frontmatter フィールドとファイルパスから生成する。
 *
 * @param filePath - エントリのファイルパス（例: `/tmp/input/project-a/test.md`）
 * @param frontmatter - frontmatter に含めるフィールドの Record。省略時は空。
 * @param content - 本文テキスト。省略時は空文字列。
 * @returns 初期化済みの `ChatlogEntry` インスタンス
 */
export const _makeEntry = (
  filePath: string,
  frontmatter: Record<string, unknown> = {},
  content = '',
): ChatlogEntry => {
  const _text = renderFrontmatter(frontmatter) + content;
  return new ChatlogEntry(_text, { filePath });
};
