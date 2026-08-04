// src: skills/_cle-libs/__tests__/helpers/chatlog-entry-helpers.ts
// @(#): ChatlogEntry テストヘルパー
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// classes
import { ChatlogEntry } from '../../classes/ChatlogEntry.class.ts';

/** ChatlogEntry テスト用ファクトリ関数群。 */
export const HCE = {
  /** テスト用の `ChatlogEntry` を filename と content テキストから生成する。filePath は `/test/<filename>`。 */
  makeChatlogEntry: (filename: string, content: string): ChatlogEntry =>
    new ChatlogEntry(content, { filePath: `/test/${filename}` }),

  /** filePath なしの `ChatlogEntry` を content テキストから生成する。 */
  makeChatlogEntryNoPath: (content: string): ChatlogEntry => new ChatlogEntry(content),
};
