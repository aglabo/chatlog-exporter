// src: skills/_scripts/__tests__/helpers/__tests__/chatlog-entry-helpers.unit.spec.ts
// @(#): HCE ユニットテスト
//       対象: HCE.makeChatlogEntry, HCE.makeChatlogEntryNoPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { HCE } from '../chatlog-entry-helpers.ts';

// ─── Tests

/**
 * `HCE` テストヘルパーのユニットテストスイート。
 *
 * makeChatlogEntry / makeChatlogEntryNoPath の生成結果を検証する。
 *
 * テスト ID 範囲: T-HLP-HCE-01 〜 T-HLP-HCE-04
 *
 * @see HCE
 */
describe('HCE', () => {
  /**
   * `HCE.makeChatlogEntry` の動作テスト。
   *
   * filename と content を受け取り、filePath 付きの `ChatlogEntry` を生成することを検証する。
   */
  describe('makeChatlogEntry', () => {
    it('[Normal] T-HLP-HCE-01: makeChatlogEntry("foo.md", "hello") → content が "hello\\n" を含む', () => {
      // arrange & act
      const _entry = HCE.makeChatlogEntry('foo.md', 'hello');

      // assert
      assertEquals(_entry.content, 'hello\n');
    });

    it('[Normal] T-HLP-HCE-02: makeChatlogEntry("foo.md", "hello") → filePath === "/test/foo.md"', () => {
      // arrange & act
      const _entry = HCE.makeChatlogEntry('foo.md', 'hello');

      // assert
      assertEquals(_entry.filePath, '/test/foo.md');
    });
  });

  /**
   * `HCE.makeChatlogEntryNoPath` の動作テスト。
   *
   * content のみ受け取り、filePath なしの `ChatlogEntry` を生成することを検証する。
   */
  describe('makeChatlogEntryNoPath', () => {
    it('[Normal] T-HLP-HCE-03: makeChatlogEntryNoPath("hello") → filename === undefined', () => {
      // arrange & act
      const _entry = HCE.makeChatlogEntryNoPath('hello');

      // assert
      assertEquals(_entry.filename, undefined);
    });

    it('[Normal] T-HLP-HCE-04: makeChatlogEntryNoPath("hello") → filePath === undefined', () => {
      // arrange & act
      const _entry = HCE.makeChatlogEntryNoPath('hello');

      // assert
      assertEquals(_entry.filePath, undefined);
    });
  });
});
