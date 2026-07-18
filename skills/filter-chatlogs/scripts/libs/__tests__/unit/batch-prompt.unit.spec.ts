// src: skills/filter-chatlogs/scripts/libs/__tests__/unit/batch-prompt.unit.spec.ts
// @(#): buildBatchPrompt のユニットテスト
//       対象: buildBatchPrompt
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertFalse, assertMatch } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildBatchPrompt } from '../../batch-prompt.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Internal Helpers

// constants
/** テスト用の単純な会話形式本文（frontmatter なし）。 */
const _SIMPLE_BODY = `### User\nHello world\n\n### Assistant\nHi there`;

/** frontmatter 付きの本文。ChatlogEntry で frontmatter が除去されることを確認する。 */
const _BODY_WITH_FRONTMATTER = `---\ntitle: Test\ndate: 2026-01-01\n---\n\n${_SIMPLE_BODY}`;

// ─── Tests

/**
 * `buildBatchPrompt` のユニットテストスイート。
 *
 * 読み込み済み `ChatlogEntry[]` を受け取り、本文を連結したバッチプロンプト文字列を返す動作を検証する。
 * ヘッダー形式は `=== <filename> ===` で、各ブロックは `\n` で結合される。
 *
 * テスト ID 範囲: T-PF-BP-01 〜 T-PF-BP-02
 *
 * @see buildBatchPrompt
 */
describe('buildBatchPrompt', () => {
  /**
   * `正常系` のテスト。
   *
   * 単一エントリ・複数エントリの動作を検証する。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-BP-01-01: 単一エントリ → "=== <filename> ===" ヘッダを含む文字列を返す', () => {
      const entry = new ChatlogEntry(_SIMPLE_BODY, { filePath: '/chatlogs/a.md' });

      const result = buildBatchPrompt([entry]);

      assertMatch(result, /^=== a\.md ===/);
    });

    it('[Normal] T-PF-BP-01-02: 複数エントリ → 各ブロックが含まれる文字列を返す', () => {
      const entry1 = new ChatlogEntry(_SIMPLE_BODY, { filePath: '/chatlogs/a.md' });
      const entry2 = new ChatlogEntry(_SIMPLE_BODY, { filePath: '/chatlogs/b.md' });

      const result = buildBatchPrompt([entry1, entry2]);

      assertMatch(result, /=== a\.md ===/);
      assertMatch(result, /=== b\.md ===/);
    });
  });

  /**
   * `エッジケース` のテスト。
   *
   * 空配列・frontmatter 付き内容を検証する。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-BP-02-01: 空の entries 配列 → 空文字列を返す', () => {
      const result = buildBatchPrompt([]);

      assertEquals(result, '');
    });

    it('[Edge] T-PF-BP-02-02: frontmatter 付きの内容 → frontmatter が除去されて本文のみ返す', () => {
      const entry = new ChatlogEntry(_BODY_WITH_FRONTMATTER, { filePath: '/chatlogs/a.md' });

      const result = buildBatchPrompt([entry]);

      // frontmatter のキーが出力に含まれないことを確認する
      assertFalse(result.includes('title: Test'));
      assertFalse(result.includes('date: 2026-01-01'));
    });
  });
});
