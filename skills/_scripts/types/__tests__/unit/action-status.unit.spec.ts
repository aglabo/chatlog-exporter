// src: skills/_scripts/types/__tests__/unit/action-status.unit.spec.ts
// @(#): action-status.types.ts のユニットテスト
//       対象: ENTRY_ACTIONS, EntryAction, ENTRY_STATUSES, EntryStatus
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertArrayIncludes, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import type { ActionStatusEntry, ActionStatusOptions } from '../../action-status-entry.types.ts';
import { ENTRY_ACTIONS, ENTRY_STATUSES } from '../../action-status.types.ts';
// types
import type { EntryAction, EntryStatus } from '../../action-status.types.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../classes/ChatlogEntry.class.ts';

// ─── Tests

/**
 * `ENTRY_ACTIONS` 定数オブジェクトと `EntryAction` 型のユニットテストスイート。
 *
 * 各プロパティ値の正確性・型安全性・ユニオン型の網羅性を検証する。
 *
 * テスト ID 範囲: T-01-01-01 〜 T-01-03-01
 *
 * @see ENTRY_ACTIONS
 * @see EntryAction
 */
describe('ENTRY_ACTIONS', () => {
  /**
   * `ENTRY_ACTIONS` の各プロパティ値が正しいリテラル文字列を持つことを検証する。
   */
  describe('values', () => {
    /** 各プロパティが期待するリテラル値を保持する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-01-01: ENTRY_ACTIONS の各キーが正しいリテラル値を持つ', () => {
        // arrange / act / assert
        assertEquals(ENTRY_ACTIONS.KEEP, 'keep');
        assertEquals(ENTRY_ACTIONS.SKIP, 'skip');
        assertEquals(ENTRY_ACTIONS.MOVE, 'move');
        assertEquals(ENTRY_ACTIONS.REMOVE, 'remove');
        assertEquals(ENTRY_ACTIONS.WRITE, 'write');
      });

      it('[Normal] T-01-01-02: ENTRY_ACTIONS.REMOVE が EntryAction 型変数に代入できる (AC-001)', () => {
        // arrange
        const _action: EntryAction = ENTRY_ACTIONS.REMOVE;

        // act / assert
        assertEquals(_action, 'remove');
      });
    });
  });

  /**
   * `EntryAction` ユニオン型が 8 値すべてを網羅していることを検証する。
   */
  describe('EntryAction union', () => {
    /** EntryAction の値域が ENTRY_ACTIONS の全 value と一致する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-01-02-01: EntryAction が 8 値のユニオン型に一致する (AC-002)', () => {
        // arrange
        const _values = Object.values(ENTRY_ACTIONS);

        // act / assert
        assertEquals(_values.length, 8);
        assertArrayIncludes(_values, ['keep', 'skip', 'move', 'remove', 'write', 'move-by-ai', 'pending', 'error']);
      });
    });
  });

  /**
   * `EntryAction` 型の型安全性を検証する。
   */
  describe('type safety', () => {
    /** EntryAction 型に列挙外の文字列を代入するとコンパイルエラーになるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-01-03-01: EntryAction 以外の文字列を代入するとコンパイルエラーになる', () => {
        // @ts-expect-error: 列挙外の文字列は EntryAction に代入できない
        const _invalid: EntryAction = 'invalid';

        // act / assert — コンパイルが通ることが検証（@ts-expect-error がエラーを抑制）
        assertEquals(typeof _invalid, 'string');
      });
    });
  });
});

/**
 * `ENTRY_STATUSES` 定数オブジェクトと `EntryStatus` 型のユニットテストスイート。
 *
 * 各プロパティ値の正確性・型安全性・ユニオン型の網羅性を検証する。
 *
 * テスト ID 範囲: T-02-01-01 〜 T-02-03-01
 *
 * @see ENTRY_STATUSES
 * @see EntryStatus
 */
describe('ENTRY_STATUSES', () => {
  /**
   * `ENTRY_STATUSES` の各プロパティ値が正しいリテラル文字列を持つことを検証する。
   */
  describe('values', () => {
    /** 各プロパティが期待するリテラル値を保持する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-02-01-01: ENTRY_STATUSES の各キーが正しいリテラル値を持つ', () => {
        // arrange / act / assert
        assertEquals(ENTRY_STATUSES.PRE_SKIPPED, 'pre-skipped');
        assertEquals(ENTRY_STATUSES.SKIPPED, 'skipped');
        assertEquals(ENTRY_STATUSES.KEPT, 'kept');
        assertEquals(ENTRY_STATUSES.MOVED, 'moved');
        assertEquals(ENTRY_STATUSES.REMOVED, 'removed');
        assertEquals(ENTRY_STATUSES.WRITTEN, 'written');
        assertEquals(ENTRY_STATUSES.ERROR, 'error');
      });

      it('[Normal] T-02-01-02: ENTRY_STATUSES.PRE_SKIPPED が EntryStatus 型変数に代入できる (AC-003)', () => {
        // arrange
        const _status: EntryStatus = ENTRY_STATUSES.PRE_SKIPPED;

        // act / assert
        assertEquals(_status, 'pre-skipped');
      });
    });
  });

  /**
   * `EntryStatus` ユニオン型が 7 値すべてを網羅していることを検証する。
   */
  describe('EntryStatus union', () => {
    /** EntryStatus の値域が ENTRY_STATUSES の全 value と一致する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-02-02-01: EntryStatus が 7 値のユニオン型に一致する (AC-004)', () => {
        // arrange
        const _values = Object.values(ENTRY_STATUSES);

        // act / assert
        assertEquals(_values.length, 7);
        assertArrayIncludes(_values, ['pre-skipped', 'skipped', 'kept', 'moved', 'removed', 'written', 'error']);
      });
    });
  });

  /**
   * `EntryStatus` 型の型安全性を検証する。
   */
  describe('type safety', () => {
    /** EntryStatus 型に列挙外の文字列を代入するとコンパイルエラーになるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-02-03-01: EntryStatus 以外の文字列を代入するとコンパイルエラーになる', () => {
        // @ts-expect-error: 列挙外の文字列は EntryStatus に代入できない
        const _invalid: EntryStatus = 'pending';

        // act / assert — コンパイルが通ることが検証（@ts-expect-error がエラーを抑制）
        assertEquals(typeof _invalid, 'string');
      });
    });
  });
});

/**
 * `ActionStatusOptions` 型と `ActionStatusEntry` 型のユニットテストスイート。
 *
 * 構造の正確性・型安全性を検証する。
 *
 * テスト ID 範囲: T-03-01-01 〜 T-03-04-01
 *
 * @see ActionStatusOptions
 * @see ActionStatusEntry
 */
describe('ActionStatusEntry', () => {
  /**
   * `ActionStatusOptions` の構造を検証する。
   */
  describe('ActionStatusOptions', () => {
    /** filePath 必須・その他オプションの正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-03-01-01: filePath 必須・action/status/reason オプションで正常に生成できる (AC-005)', () => {
        // arrange
        const _options: ActionStatusOptions = { filePath: '/path/to/file.md' };

        // act / assert
        assertEquals(_options.filePath, '/path/to/file.md');
        assertEquals(_options.action, undefined);
        assertEquals(_options.status, undefined);
        assertEquals(_options.reason, undefined);
      });

      it('[Normal] T-03-01-02: filePath に空文字列 "" を指定して正常に生成できる (AC-011, R-006)', () => {
        // arrange
        const _options: ActionStatusOptions = { filePath: '' };

        // act / assert
        assertEquals(_options.filePath, '');
      });

      it('[Normal] T-02-01-01: targetPath を設定でき、値が取得できる', () => {
        // arrange
        const _options: ActionStatusOptions = { filePath: '/src/file.md', targetPath: '/dest/file.md' };

        // act / assert
        assertEquals(_options.targetPath, '/dest/file.md');
      });
    });

    /** targetPath 省略・空文字列など境界値のケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-02-01-02: targetPath を省略すると undefined になる', () => {
        // arrange
        const _options: ActionStatusOptions = { filePath: '/src/file.md' };

        // act / assert
        assertEquals(_options.targetPath, undefined);
      });

      it('[Edge] T-02-01-03: targetPath に空文字列を設定できる', () => {
        // arrange
        const _options: ActionStatusOptions = { filePath: '/src/file.md', targetPath: '' };

        // act / assert
        assertEquals(_options.targetPath, '');
      });
    });

    /** targetPath に不正な型を代入するとコンパイルエラーになるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-02-01-04: targetPath に数値を代入するとコンパイルエラーになる', () => {
        // @ts-expect-error targetPath is string only
        const _options: ActionStatusOptions = { filePath: '/src/file.md', targetPath: 123 };

        // act / assert — コンパイルが通ることが検証（@ts-expect-error がエラーを抑制）
        assertEquals(typeof _options.targetPath, 'number');
      });
    });
  });

  /**
   * `ActionStatusEntry` の構造を検証する。
   */
  describe('ActionStatusEntry structure', () => {
    /** entry と options の 2プロパティ構造の正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-03-02-01: ActionStatusEntry が entry と options の 2プロパティのみを持つ (AC-012)', () => {
        // arrange
        const _entry = new ChatlogEntry('');
        const _options: ActionStatusOptions = { filePath: '' };
        const _statusEntry: ActionStatusEntry = { entry: _entry, options: _options };

        // act / assert
        assertEquals(Object.keys(_statusEntry).length, 2);
        assertEquals('entry' in _statusEntry, true);
        assertEquals('options' in _statusEntry, true);
      });

      it('[Normal] T-03-02-02: ChatlogEntry と ActionStatusOptions を指定して正常に生成できる', () => {
        // arrange
        const _entry = new ChatlogEntry('');
        const _options: ActionStatusOptions = {
          filePath: '/path/to/file.md',
          action: 'keep',
          status: 'kept',
          reason: 'test reason',
        };

        // act
        const _statusEntry: ActionStatusEntry = { entry: _entry, options: _options };

        // assert
        assertEquals(_statusEntry.entry, _entry);
        assertEquals(_statusEntry.options.filePath, '/path/to/file.md');
        assertEquals(_statusEntry.options.action, 'keep');
        assertEquals(_statusEntry.options.status, 'kept');
        assertEquals(_statusEntry.options.reason, 'test reason');
      });
    });
  });

  /**
   * `ActionStatusEntry` の型安全性を検証する。
   */
  describe('type safety', () => {
    /** entry フィールドに ChatlogEntry 以外を代入するとコンパイルエラーになるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-03-03-01: entry に ChatlogEntry 以外を代入するとコンパイルエラーになる (AC-006)', () => {
        // @ts-expect-error: 文字列は ChatlogEntry に代入できない
        const _statusEntry: ActionStatusEntry = { entry: 'not-a-chatlog-entry', options: { filePath: '' } };

        // act / assert — コンパイルが通ることが検証（@ts-expect-error がエラーを抑制）
        assertEquals(typeof _statusEntry.entry, 'string');
      });
    });

    /** options.action に列挙外の文字列を代入するとコンパイルエラーになるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-03-04-01: options.action に EntryAction 以外の文字列を代入するとコンパイルエラーになる (AC-007)', () => {
        // @ts-expect-error: 列挙外の文字列は EntryAction に代入できない
        const _options: ActionStatusOptions = { filePath: '', action: 'delete' };

        // act / assert — コンパイルが通ることが検証（@ts-expect-error がエラーを抑制）
        assertEquals(typeof _options.action, 'string');
      });
    });
  });
});
