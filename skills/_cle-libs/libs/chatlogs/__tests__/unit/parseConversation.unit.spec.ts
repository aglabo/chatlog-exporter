// src: skills/_cle-libs/libs/chatlogs/__tests__/unit/parseConversation.unit.spec.ts
// @(#): parseConversation のユニットテスト
//       対象: parseConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseConversation, renderConversation } from '../../conversation-utils.ts';

// ─── Tests

/**
 * `parseConversation` のユニットテストスイート。
 *
 * Markdown 本文から User/Assistant の会話ターンを正しく抽出できることを検証する。
 *
 * テスト ID 範囲: T-SC-PC-01 〜 T-SC-PC-09
 *
 * @see parseConversation
 * @see renderConversation
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

    it('[Edge] T-SC-PC-06: コンテンツ内の "### User" というテキストはターン分割されない', () => {
      const _body = '### User\n本文中に ### User という文字が含まれる場合\n### Assistant\n回答';
      const _result = parseConversation(_body);
      // User ターンのコンテンツに "### User" テキストが含まれていること（分割されないこと）
      assertEquals(_result.length, 2);
      assertEquals(_result[0].role, 'user');
      assertEquals(_result[1].role, 'assistant');
    });

    it('[Edge] T-SC-PC-07: 空コンテンツのターンは結果に含まれない', () => {
      const _body = '### User\n\n### Assistant\n回答\n### User\n質問';
      const _result = parseConversation(_body);
      // 空の User ターンは除外され、Assistant と後続の User のみ残る
      // 空コンテンツターンが除外されていることを確認
      for (const turn of _result) {
        assert(turn.content.trim().length > 0);
      }
    });

    it('[Edge] T-SC-PC-08: renderConversation の maxChars が指定されると指定文字数以内に収まる', () => {
      // parseConversation と renderConversation を組み合わせた境界値
      const _turns = parseConversation('### User\n' + 'a'.repeat(200) + '\n### Assistant\n' + 'b'.repeat(200));
      const _rendered = renderConversation(_turns, 100);
      assert(_rendered.length <= 100);
    });
  });
});
