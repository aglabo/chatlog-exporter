// src: skills/_cle-libs/classes/__tests__/unit/ChatlogError.unit.spec.ts
// @(#): ChatlogError クラスのユニットテスト
//       対象: ChatlogError
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertInstanceOf } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─── Tests

/**
 * `ChatlogError` クラスのユニットテストスイート。
 *
 * コンストラクタの message 生成・プロパティ設定・instanceof 判定を検証する。
 *
 * テスト ID 範囲: T-CLS-ERR-01 〜 T-CLS-ERR-08
 *
 * @see ChatlogError
 */
describe('ChatlogError', () => {
  /**
   * `constructor` のインスタンス生成テスト。
   *
   * message フォーマット・kind/subindex プロパティ・name・instanceof を検証する。
   */
  describe('constructor', () => {
    /** 有効な引数を渡してインスタンスを生成するケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-ERR-01: kind=InvalidFormat, subindex=NotClosed, detail=msg → message === Invalid Format: msg', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', 'msg');
        assertEquals(_err.message, 'Invalid Format: msg');
      });

      it('[Normal] T-CLS-ERR-02: kind と subindex プロパティが正しく設定される', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', 'msg');
        assertEquals(_err.kind, 'InvalidFormat');
        assertEquals(_err.subindex, 'NotClosed');
      });

      it('[Normal] T-CLS-ERR-03: name === ChatlogError', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', 'msg');
        assertEquals(_err.name, 'ChatlogError');
      });

      it('[Normal] T-CLS-ERR-04: instanceof Error が true', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', 'msg');
        assertInstanceOf(_err, Error);
      });

      it('[Normal] T-CLS-ERR-05: instanceof ChatlogError が true', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', 'msg');
        assertInstanceOf(_err, ChatlogError);
      });

      it('[Normal] T-CLS-ERR-06: kind=FileDirNotFound → message === File Or Dir Not Found: detail', () => {
        const _err = new ChatlogError('FileDirNotFound', 'SomeFile', 'detail');
        assertEquals(_err.message, 'File Or Dir Not Found: detail');
      });
    });

    /** detail を省略した場合のデフォルト値ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-CLS-ERR-07: detail 省略時に message === Invalid Format: Undefined Error', () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed');
        assertEquals(_err.message, 'Invalid Format: Undefined Error');
      });
    });

    /** 境界値・空文字列のケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-CLS-ERR-08: detail=''（空文字）のとき message === Invalid Format: ", () => {
        const _err = new ChatlogError('InvalidFormat', 'NotClosed', '');
        assertEquals(_err.message, 'Invalid Format: ');
      });
    });
  });
});
