// src: skills/_scripts/libs/chatlogs/__tests__/unit/parseConversation.unit.spec.ts
// @(#): parseConversation のユニットテスト
//       対象: parseConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseConversation } from '../../conversation-utils.ts';

// ─── Tests

/**
 * `parseConversation` のユニットテストスイート。
 *
 * Markdown 本文から User/Assistant の会話ターンを正しく抽出できることを検証する。
 *
 * テスト ID 範囲: T-SC-PC-01 〜 T-SC-PC-05
 *
 * @see parseConversation
 */
describe('parseConversation', () => {
  /** 正常な Markdown 会話本文のケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-SC-PC-01: User と Assistant の2ターンを正しく抽出する', () => {
      const body = '### User\nhello\n### Assistant\nworld';
      const result = parseConversation(body);
      assertEquals(result.length, 2);
      assertEquals(result[0].role, 'user');
      assertEquals(result[1].role, 'assistant');
    });

    it('[Normal] T-SC-PC-02: User のみのターンを抽出する', () => {
      const body = '### User\nhello';
      const result = parseConversation(body);
      assertEquals(result.length, 1);
      assertEquals(result[0].role, 'user');
    });

    it('[Normal] T-SC-PC-03: 複数ターン（4つ）を正しく抽出する', () => {
      const body = '### User\nq1\n### Assistant\na1\n### User\nq2\n### Assistant\na2';
      const result = parseConversation(body);
      assertEquals(result.length, 4);
    });
  });

  /** 空・ヘッダーなし・テキストなしターンのケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-SC-PC-04: 空本文から空配列が返る', () => {
      const result = parseConversation('');
      assertEquals(result, []);
    });

    it('[Edge] T-SC-PC-05: ヘッダーなし本文から空配列が返る', () => {
      const result = parseConversation('just plain text without headers');
      assertEquals(result, []);
    });
  });
});
