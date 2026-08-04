// src: skills/_cle-libs/libs/chatlogs/__tests__/unit/conversation-utils.unit.spec.ts
// @(#): conversation-utils.ts のユニットテスト
//       対象: getUserTurns / getAssistantTurns / countChars /
//             hasUserTurn / isSingleUserTurn / renderConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// ─── BDD modules
import { assert, assertEquals, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  countChars,
  getAssistantTurns,
  getUserTurns,
  hasUserTurn,
  isSingleUserTurn,
  renderConversation,
} from '../../conversation-utils.ts';
// constants
import { ConversationRole } from '../../../../types/conversation-role.const.types.ts';
// types
import type { Conversation } from '../../../../types/conversation.types.ts';

// ─── Internal Helpers

// constants
const _USER_TURN = { role: ConversationRole.user, content: 'Hello' };
const _ASSISTANT_TURN = { role: ConversationRole.assistant, content: 'Hi there' };
const _MIXED: Conversation = [_USER_TURN, _ASSISTANT_TURN, { role: ConversationRole.user, content: 'Bye' }];
const _ONLY_USER: Conversation = [_USER_TURN, { role: ConversationRole.user, content: 'Another' }];
const _ONLY_ASSISTANT: Conversation = [_ASSISTANT_TURN];
const _EMPTY: Conversation = [];
const _SINGLE_USER: Conversation = [_USER_TURN];

// ─── Tests

/**
 * `conversation-utils` モジュールのユニットテストスイート。
 *
 * getUserTurns / getAssistantTurns / countChars / hasUserTurn / isSingleUserTurn / renderConversation を検証する。
 *
 * テスト ID 範囲: T-SC-CU-01 〜 T-SC-CU-21
 *
 * @see getUserTurns
 * @see getAssistantTurns
 * @see countChars
 * @see hasUserTurn
 * @see isSingleUserTurn
 * @see renderConversation
 */
describe('conversation-utils', () => {
  /**
   * `getUserTurns` のテスト。
   *
   * role=user のターンのみ抽出できることを検証する。
   */
  describe('getUserTurns', () => {
    /** role=user があるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-01: user と assistant が混在 → user のみ返す', () => {
        const result = getUserTurns(_MIXED);
        assertEquals(result.length, 2);
        assert(result.every((t) => t.role === 'user'));
      });

      it('[Normal] T-SC-CU-02: user のみ → すべて返す', () => {
        const result = getUserTurns(_ONLY_USER);
        assertEquals(result.length, 2);
      });
    });

    /** user ターンがない・空配列のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-03: 空配列 → 空配列を返す', () => {
        assertEquals(getUserTurns(_EMPTY).length, 0);
      });

      it('[Edge] T-SC-CU-04: assistant のみ → 空配列を返す', () => {
        assertEquals(getUserTurns(_ONLY_ASSISTANT).length, 0);
      });
    });
  });

  /**
   * `getAssistantTurns` のテスト。
   *
   * role=assistant のターンのみ抽出できることを検証する。
   */
  describe('getAssistantTurns', () => {
    /** role=assistant があるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-05: user と assistant が混在 → assistant のみ返す', () => {
        const result = getAssistantTurns(_MIXED);
        assertEquals(result.length, 1);
        assertEquals(result[0].role, 'assistant');
      });
    });

    /** assistant ターンがない・空配列のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-06: 空配列 → 空配列を返す', () => {
        assertEquals(getAssistantTurns(_EMPTY).length, 0);
      });

      it('[Edge] T-SC-CU-07: user のみ → 空配列を返す', () => {
        assertEquals(getAssistantTurns(_ONLY_USER).length, 0);
      });
    });
  });

  /**
   * `countChars` のテスト。
   *
   * Turn[] の content 合計文字数を返すことを検証する。
   */
  describe('countChars', () => {
    /** 通常のターン配列のケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-08: 複数ターン → content.length の合計を返す', () => {
        const turns = [_USER_TURN, _ASSISTANT_TURN];
        const expected = _USER_TURN.content.length + _ASSISTANT_TURN.content.length;
        assertEquals(countChars(turns), expected);
      });

      it('[Normal] T-SC-CU-09: 1 ターン → その content.length を返す', () => {
        assertEquals(countChars([_USER_TURN]), _USER_TURN.content.length);
      });
    });

    /** 空配列のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-10: 空配列 → 0 を返す', () => {
        assertEquals(countChars([]), 0);
      });
    });
  });

  /**
   * `hasUserTurn` のテスト。
   *
   * user ターンの有無を boolean で返すことを検証する。
   */
  describe('hasUserTurn', () => {
    /** user ターンがあるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-11: user ターンあり → true', () => {
        assert(hasUserTurn(_MIXED));
      });
    });

    /** user ターンがない・空配列のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-12: user ターンなし（assistantのみ）→ false', () => {
        assertFalse(hasUserTurn(_ONLY_ASSISTANT));
      });

      it('[Edge] T-SC-CU-13: 空配列 → false', () => {
        assertFalse(hasUserTurn(_EMPTY));
      });
    });
  });

  /**
   * `isSingleUserTurn` のテスト。
   *
   * user ターンがちょうど 1 件かどうかを検証する。
   */
  describe('isSingleUserTurn', () => {
    /** user ターン 1 件のケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-14: user ターン 1 件 → true', () => {
        assert(isSingleUserTurn(_SINGLE_USER));
      });
    });

    /** 0件・2件以上のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-15: user ターン 0 件 → false', () => {
        assertFalse(isSingleUserTurn(_EMPTY));
      });

      it('[Edge] T-SC-CU-16: user ターン 2 件以上 → false', () => {
        assertFalse(isSingleUserTurn(_MIXED));
      });
    });
  });

  /**
   * `renderConversation` のテスト。
   *
   * Turn[] を Markdown に再構築できることを検証する。
   */
  describe('renderConversation', () => {
    /** 通常変換のケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-SC-CU-17: user + assistant → Markdown セクションに変換する', () => {
        const conv: Conversation = [_USER_TURN, _ASSISTANT_TURN];
        const result = renderConversation(conv);
        assertEquals(result, `### User\n${_USER_TURN.content}\n\n### Assistant\n${_ASSISTANT_TURN.content}`);
      });

      it('[Normal] T-SC-CU-18: maxChars 指定 → 指定文字数で切り詰める', () => {
        const conv: Conversation = [{ role: ConversationRole.user, content: 'ABCDEFGHIJ' }];
        const result = renderConversation(conv, 10);
        assertEquals(result.length, 10);
      });

      it('[Normal] T-SC-CU-19: maxChars が本文より長い → 全文を返す', () => {
        const conv: Conversation = [_USER_TURN];
        const full = renderConversation(conv);
        assertEquals(renderConversation(conv, full.length + 100), full);
      });
    });

    /** 空配列・maxChars なしのケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-SC-CU-20: 空配列 → 空文字を返す', () => {
        assertEquals(renderConversation(_EMPTY), '');
      });

      it('[Edge] T-SC-CU-21: maxChars 未指定 → 全文を返す（切り詰めなし）', () => {
        const conv: Conversation = [{ role: ConversationRole.user, content: 'Hello World' }];
        const result = renderConversation(conv);
        assertEquals(result, '### User\nHello World');
      });
    });
  });
});
