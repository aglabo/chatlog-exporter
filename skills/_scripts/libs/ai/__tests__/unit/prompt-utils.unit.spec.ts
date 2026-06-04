// src: skills/_scripts/libs/ai/__tests__/unit/prompt-utils.unit.spec.ts
// @(#): prompt-utils ユニットテスト
//       対象: buildUserEntries, buildConversationEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConversationEntries, buildUserEntries } from '../../prompt-utils.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../classes/ChatlogEntry.class.ts';
// Error
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
// test helpers
import { HCE } from '../../../../__tests__/helpers/chatlog-entry-helpers.ts';

// ─── Internal Helpers

// types
type EntryCase = {
  id: string;
  label: string;
  entries: ChatlogEntry[];
  maxLen?: number;
  expected: string;
};

// ─── Tests

/**
 * `buildUserEntries` のユニットテストスイート。
 *
 * `ChatlogEntry[]` を `=== <filename> ===\n<body>\n\n` 形式に変換し
 * 連結して返す動作を検証する。
 *
 * テスト ID 範囲: T-LIB-PU-01 〜 T-LIB-PU-08
 *
 * @see buildUserEntries
 */
describe('buildUserEntries', () => {
  /**
   * 正常な入力に対してエントリ文字列を生成するシナリオ。
   */
  describe('When: 正常系', () => {
    // constants
    /** `buildUserEntries` 正常系テーブル（T-LIB-PU-01〜04, 06）。 */
    const _cases: EntryCase[] = [
      {
        id: 'T-LIB-PU-01',
        label: '空配列 → ""',
        entries: [],
        expected: '',
      },
      {
        id: 'T-LIB-PU-02',
        label: '1要素、maxContentLength=0（デフォルト）→ ヘッダ+全文+空行',
        entries: [HCE.makeChatlogEntry('foo.md', 'hello')],
        expected: '=== foo.md ===\nhello\n\n',
      },
      {
        id: 'T-LIB-PU-03',
        label: '2要素、maxContentLength=0 → 空行1つで区切られる',
        entries: [HCE.makeChatlogEntry('a.md', 'alpha'), HCE.makeChatlogEntry('b.md', 'beta')],
        expected: '=== a.md ===\nalpha\n\n=== b.md ===\nbeta\n\n',
      },
      {
        id: 'T-LIB-PU-04',
        label: 'maxContentLength > 0 → truncateContent で切り詰め',
        // truncateContent(5) → "hell\n" (4chars + \n)
        entries: [HCE.makeChatlogEntry('foo.md', 'hello world')],
        maxLen: 5,
        expected: '=== foo.md ===\nhell\n\n',
      },
      {
        id: 'T-LIB-PU-06',
        label: '3要素 → 全ブロックが空行1つで区切られる',
        entries: [
          HCE.makeChatlogEntry('a.md', 'AAA'),
          HCE.makeChatlogEntry('b.md', 'BBB'),
          HCE.makeChatlogEntry('c.md', 'CCC'),
        ],
        expected: '=== a.md ===\nAAA\n\n=== b.md ===\nBBB\n\n=== c.md ===\nCCC\n\n',
      },
    ];

    _cases.forEach(({ id, label, entries, maxLen, expected }) => {
      it(`[Normal] ${id}: ${label}`, () => {
        assertEquals(buildUserEntries(entries, maxLen), expected);
      });
    });
  });

  /**
   * 境界値・特殊入力ケース。
   */
  describe('When: エッジケース', () => {
    // constants
    /** `buildUserEntries` エッジケーステーブル（T-LIB-PU-05, 08）。 */
    const _cases: EntryCase[] = [
      {
        id: 'T-LIB-PU-05',
        label: 'content が空 → ヘッダ+空行のみ',
        entries: [new ChatlogEntry('---\ntitle: test\n---\n', { filePath: '/test/foo.md' })],
        expected: '=== foo.md ===\n\n\n',
      },
      {
        id: 'T-LIB-PU-08',
        label: 'maxContentLength=1 → truncateContent が空文字を返しブロックが空行のみ',
        // truncateContent(1) → slice(0, 0) = '' → '' (空文字)
        entries: [HCE.makeChatlogEntry('foo.md', 'hello')],
        maxLen: 1,
        expected: '=== foo.md ===\n\n',
      },
    ];

    _cases.forEach(({ id, label, entries, maxLen, expected }) => {
      it(`[Edge] ${id}: ${label}`, () => {
        assertEquals(buildUserEntries(entries, maxLen), expected);
      });
    });
  });

  /**
   * 不正な入力でエラーがスローされるケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-PU-07: filePath なし → ChatlogError を throw', () => {
      assertThrows(
        () => buildUserEntries([HCE.makeChatlogEntryNoPath('hello')]),
        ChatlogError,
      );
    });
  });
});

/**
 * `buildConversationEntries` のユニットテストスイート。
 *
 * `ChatlogEntry[]` を会話ターンのみ抽出した `=== <filename> ===\n<body>\n\n` 形式に変換し
 * 連結して返す動作を検証する。
 *
 * テスト ID 範囲: T-LIB-PU-11 〜 T-LIB-PU-17
 *
 * @see buildConversationEntries
 */
describe('buildConversationEntries', () => {
  /**
   * 正常な入力に対してエントリ文字列を生成するシナリオ。
   */
  describe('When: 正常系', () => {
    // constants
    /** `buildConversationEntries` 正常系テーブル（T-LIB-PU-11〜13, 15）。 */
    const _cases: EntryCase[] = [
      {
        id: 'T-LIB-PU-11',
        label: '空配列 → ""',
        entries: [],
        expected: '',
      },
      {
        id: 'T-LIB-PU-12',
        label: '1要素、maxContentLength=0（デフォルト）→ ヘッダ+会話全文+空行',
        entries: [
          new ChatlogEntry('### User\n質問\n\n### Assistant\n回答\n', { filePath: '/path/to/foo.md' }),
        ],
        expected: '=== foo.md ===\n### User\n質問\n\n### Assistant\n回答\n\n',
      },
      {
        id: 'T-LIB-PU-13',
        label: '2要素 → 空行1つで区切られる',
        entries: [
          new ChatlogEntry('### User\n質問A\n\n### Assistant\n回答A\n', { filePath: '/path/to/a.md' }),
          new ChatlogEntry('### User\n質問B\n\n### Assistant\n回答B\n', { filePath: '/path/to/b.md' }),
        ],
        expected:
          '=== a.md ===\n### User\n質問A\n\n### Assistant\n回答A\n\n=== b.md ===\n### User\n質問B\n\n### Assistant\n回答B\n\n',
      },
      {
        id: 'T-LIB-PU-15',
        label: '3要素 → 全ブロックが空行1つで区切られる',
        entries: [
          new ChatlogEntry('### User\nQ1\n\n### Assistant\nA1\n', { filePath: '/p/a.md' }),
          new ChatlogEntry('### User\nQ2\n\n### Assistant\nA2\n', { filePath: '/p/b.md' }),
          new ChatlogEntry('### User\nQ3\n\n### Assistant\nA3\n', { filePath: '/p/c.md' }),
        ],
        expected: '=== a.md ===\n### User\nQ1\n\n### Assistant\nA1\n\n'
          + '=== b.md ===\n### User\nQ2\n\n### Assistant\nA2\n\n'
          + '=== c.md ===\n### User\nQ3\n\n### Assistant\nA3\n\n',
      },
    ];

    _cases.forEach(({ id, label, entries, maxLen, expected }) => {
      it(`[Normal] ${id}: ${label}`, () => {
        assertEquals(buildConversationEntries(entries, maxLen), expected);
      });
    });
  });

  /**
   * 境界値・特殊入力ケース。
   */
  describe('When: エッジケース', () => {
    // constants
    /** `buildConversationEntries` エッジケーステーブル（T-LIB-PU-14, 16）。 */
    const _cases: EntryCase[] = [
      {
        id: 'T-LIB-PU-14',
        label: 'maxContentLength > 0 → 指定文字数で切り詰め',
        // maxContentLength=5 → renderConversation は "### U"
        entries: [
          new ChatlogEntry('### User\n質問\n\n### Assistant\n回答\n', { filePath: '/path/to/foo.md' }),
        ],
        maxLen: 5,
        expected: '=== foo.md ===\n### U\n\n',
      },
      {
        id: 'T-LIB-PU-16',
        label: '会話ターンなし（frontmatterのみ）→ body が空行のみ',
        entries: [new ChatlogEntry('---\ntitle: test\n---\n', { filePath: '/test/foo.md' })],
        expected: '=== foo.md ===\n\n\n',
      },
    ];

    _cases.forEach(({ id, label, entries, maxLen, expected }) => {
      it(`[Edge] ${id}: ${label}`, () => {
        assertEquals(buildConversationEntries(entries, maxLen), expected);
      });
    });
  });

  /**
   * 不正な入力でエラーがスローされるケース。
   */
  describe('When: 異常系', () => {
    it('[Error] T-LIB-PU-17: filePath なし → ChatlogError を throw', () => {
      assertThrows(
        () => buildConversationEntries([HCE.makeChatlogEntryNoPath('### User\n質問\n\n### Assistant\n回答\n')]),
        ChatlogError,
      );
    });
  });
});
