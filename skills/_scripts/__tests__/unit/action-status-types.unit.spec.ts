// src: skills/_scripts/__tests__/unit/action-status-types.unit.spec.ts
// @(#): ENTRY_ACTIONS 定数・EntryAction 型のユニットテスト
//       対象: ENTRY_ACTIONS, EntryAction
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ENTRY_ACTIONS } from '../../types/action-status.types.ts';
// types
import type { EntryAction } from '../../types/action-status.types.ts';

// ─── Tests

/**
 * `ENTRY_ACTIONS` 定数オブジェクトのユニットテストスイート。
 *
 * 追加された3値（MOVEBYAI / PENDING / ERROR）の値と型を検証する。
 *
 * テスト ID 範囲: T-01-01 〜 T-01-03
 *
 * @see ENTRY_ACTIONS
 * @see EntryAction
 */
describe('ENTRY_ACTIONS', () => {
  /**
   * `ENTRY_ACTIONS.MOVEBYAI` の値と `EntryAction` 型への含有を検証する。
   */
  describe('MOVEBYAI', () => {
    /** `MOVEBYAI` キーが正しい値を持ち、型に含まれる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-01-01: ENTRY_ACTIONS.MOVEBYAI === "move-by-ai"', () => {
        assertEquals(ENTRY_ACTIONS.MOVEBYAI, 'move-by-ai');
      });

      it('[Normal] T-01-01-02: EntryAction 型が "move-by-ai" を含む', () => {
        const _action: EntryAction = ENTRY_ACTIONS.MOVEBYAI;
        assertEquals(_action, 'move-by-ai');
      });
    });
  });

  /**
   * `ENTRY_ACTIONS.PENDING` の値と `EntryAction` 型への含有を検証する。
   */
  describe('PENDING', () => {
    /** `PENDING` キーが正しい値を持ち、型に含まれる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-02-01: ENTRY_ACTIONS.PENDING === "pending"', () => {
        assertEquals(ENTRY_ACTIONS.PENDING, 'pending');
      });

      it('[Normal] T-01-02-02: EntryAction 型が "pending" を含む', () => {
        const _action: EntryAction = ENTRY_ACTIONS.PENDING;
        assertEquals(_action, 'pending');
      });
    });
  });

  /**
   * `ENTRY_ACTIONS.ERROR` の値と `EntryAction` 型への含有を検証する。
   */
  describe('ERROR', () => {
    /** `ERROR` キーが正しい値を持ち、型に含まれる正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-03-01: ENTRY_ACTIONS.ERROR === "error"', () => {
        assertEquals(ENTRY_ACTIONS.ERROR, 'error');
      });

      it('[Normal] T-01-03-02: EntryAction 型が "error" を含む', () => {
        const _action: EntryAction = ENTRY_ACTIONS.ERROR;
        assertEquals(_action, 'error');
      });
    });
  });
});
