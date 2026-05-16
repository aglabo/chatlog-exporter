// src: skills/_scripts/__tests__/unit/conversation-role.unit.spec.ts
// @(#): ConversationRole 定数・型のユニットテスト
//       対象: ConversationRole
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertArrayIncludes, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ConversationRole } from '../../types/conversation-role.const.types.ts';

// ─── Tests

/**
 * `ConversationRole` 定数オブジェクトのユニットテストスイート。
 *
 * 各プロパティ値・値の網羅性を検証する。
 *
 * テスト ID 範囲: T-CR-CR-01 〜 T-CR-CR-03
 *
 * @see ConversationRole
 */
describe('ConversationRole', () => {
  /**
   * `ConversationRole` の各プロパティ値が正しいリテラル文字列を持つことを検証する。
   */
  describe('values', () => {
    /** 各プロパティが期待するリテラル値を保持する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CR-CR-01: ConversationRole.user === "user"', () => {
        // arrange / act / assert
        assertEquals(ConversationRole.user, 'user');
      });

      it('[Normal] T-CR-CR-02: ConversationRole.assistant === "assistant"', () => {
        // arrange / act / assert
        assertEquals(ConversationRole.assistant, 'assistant');
      });

      it('[Normal] T-CR-CR-03: Object.values(ConversationRole) は "user" と "assistant" の 2 値のみを含む', () => {
        // arrange
        const _values = Object.values(ConversationRole);

        // act / assert
        assertEquals(_values.length, 2);
        assertArrayIncludes(_values, ['user', 'assistant']);
      });
    });
  });
});
