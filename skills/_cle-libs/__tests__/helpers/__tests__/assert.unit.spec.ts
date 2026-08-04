// Copyright (c) 2026 atsushifx <http://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// src: skills/_cle-libs/__tests__/helpers/__tests__/assert.unit.spec.ts
// @(#): assert ヘルパー関数ユニットテスト
//       対象: assertTrue / assertNull / assertNotNull / assertFileExist / assertFileNotExist
//             assertThrowsChatlogError / assertRejectsChatlogError
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  assertFileExist,
  assertFileNotExist,
  assertNotNull,
  assertNull,
  assertRejectsChatlogError,
  assertThrowsChatlogError,
  assertTrue,
} from '../assert.ts';

// ─── Helpers
import { ChatlogError } from '../../../classes/ChatlogError.class.ts';
// types
import type { ErrorKind } from '../../../types/chatlog-error.types.ts';

// ─── Internal Helpers

// constants
/** 一時ディレクトリパスを保持する変数。beforeEach/afterEach で管理する。 */
let tempDir: string;

// functions
/**
 * 指定した kind / subindex で `ChatlogError` をスローする関数を返す。
 *
 * @param kind - スローする `ChatlogError` の kind
 * @param subindex - スローする `ChatlogError` の subindex
 * @returns `ChatlogError` をスローするコールバック
 */
const _throwChatlogError = (kind: ErrorKind, subindex: string): () => never => {
  return () => {
    throw new ChatlogError(kind, subindex, 'test error');
  };
};

/**
 * `ChatlogError` ではない通常の `Error` をスローする関数。
 *
 * @returns 常に `Error` をスローする
 */
const _throwPlainError = (): never => {
  throw new Error('plain error');
};

/**
 * 指定した kind / subindex で `ChatlogError` を reject する非同期関数を返す。
 *
 * @param kind - reject する `ChatlogError` の kind
 * @param subindex - reject する `ChatlogError` の subindex
 * @returns `ChatlogError` を reject する非同期コールバック
 */
const _rejectChatlogError = (kind: ErrorKind, subindex: string): () => Promise<never> => {
  return () => Promise.reject(new ChatlogError(kind, subindex, 'test error'));
};

/**
 * `ChatlogError` ではない通常の `Error` を reject する非同期関数。
 *
 * @returns 常に `Error` を reject する
 */
const _rejectPlainError = (): Promise<never> => Promise.reject(new Error('plain error'));

// ─── Tests

/**
 * assert ヘルパー関数群のユニットテストスイート。
 *
 * assertTrue / assertNull / assertNotNull / assertFileExist / assertFileNotExist /
 * assertThrowsChatlogError / assertRejectsChatlogError を検証する。
 *
 * テスト ID 範囲: T-AH-AT-01 〜 T-AH-RCE-04
 *
 * @see assertTrue
 * @see assertNull
 * @see assertNotNull
 * @see assertFileExist
 * @see assertFileNotExist
 * @see assertThrowsChatlogError
 * @see assertRejectsChatlogError
 */
describe('assertHelpers', () => {
  /**
   * assertTrue のテスト。
   *
   * truthy 値で pass / falsy 値で AssertionError が throw される動作を検証する。
   */
  describe('assertTrue', () => {
    /** truthy 値を渡した場合（正常系）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-AT-01: truthy な値を渡す → エラーなく通過する', () => {
        // act & assert (no throw)
        assertTrue(true);
        assertTrue(1);
        assertTrue('non-empty');
        assertTrue({});
      });
    });

    /** falsy 値を渡した場合（異常系）。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-AT-02: falsy な値を渡す → AssertionError が throw される', () => {
        assertThrows(() => assertTrue(false));
        assertThrows(() => assertTrue(0));
        assertThrows(() => assertTrue(''));
        assertThrows(() => assertTrue(null));
      });
    });
  });

  /**
   * assertNull のテスト。
   *
   * null 値で pass / 非 null 値で AssertionError が throw される動作を検証する。
   */
  describe('assertNull', () => {
    /** null を渡した場合（正常系）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-AN-01: null を渡す → エラーなく通過する', () => {
        // act & assert (no throw)
        assertNull(null);
      });
    });

    /** 非 null を渡した場合（異常系）。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-AN-02: null でない値を渡す → AssertionError が throw される', () => {
        assertThrows(() => assertNull(undefined));
        assertThrows(() => assertNull(0));
        assertThrows(() => assertNull(''));
        assertThrows(() => assertNull(false));
      });
    });
  });

  /**
   * assertNotNull のテスト。
   *
   * 非 null 値で pass / null 値で AssertionError が throw される動作を検証する。
   */
  describe('assertNotNull', () => {
    /** 非 null を渡した場合（正常系）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-ANN-01: null でない値を渡す → エラーなく通過する', () => {
        // act & assert (no throw)
        assertNotNull(undefined);
        assertNotNull(0);
        assertNotNull('');
        assertNotNull(false);
        assertNotNull({});
      });
    });

    /** null を渡した場合（異常系）。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-ANN-02: null を渡す → AssertionError が throw される', () => {
        assertThrows(() => assertNotNull(null));
      });
    });
  });

  /**
   * assertFileExist のテスト。
   *
   * 存在するファイルで pass / 存在しないパスで AssertionError が throw される動作を検証する。
   */
  describe('assertFileExist', () => {
    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: 'assert-helper-' });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 存在するファイルパスを渡した場合（正常系）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-AFE-01: 存在するファイルのパスを渡す → エラーなく通過する', async () => {
        // arrange
        const _filePath = `${tempDir}/exists.txt`;
        await Deno.writeTextFile(_filePath, '');

        // act & assert (no throw)
        await assertFileExist(_filePath);
      });
    });

    /** 存在しないパスを渡した場合（異常系）。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-AFE-02: 存在しないパスを渡す → AssertionError が throw される', async () => {
        // arrange
        const _filePath = `${tempDir}/nonexistent.txt`;

        // act & assert
        await assertRejects(async () => await assertFileExist(_filePath));
      });
    });
  });

  /**
   * assertFileNotExist のテスト。
   *
   * 存在しないパスで pass / 存在するファイルで AssertionError が throw される動作を検証する。
   */
  describe('assertFileNotExist', () => {
    beforeEach(async () => {
      tempDir = await Deno.makeTempDir({ prefix: 'assert-helper-' });
    });

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    /** 存在しないパスを渡した場合（正常系）。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-FNE-01: 存在しないパスを渡す → エラーなく通過する', async () => {
        // arrange
        const _filePath = `${tempDir}/nonexistent.txt`;

        // act & assert (no throw)
        await assertFileNotExist(_filePath);
      });
    });

    /** 存在するファイルパスを渡した場合（異常系）。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-FNE-02: 存在するファイルのパスを渡す → AssertionError が throw される', async () => {
        // arrange
        const _filePath = `${tempDir}/exists.txt`;
        await Deno.writeTextFile(_filePath, '');

        // act & assert
        await assertRejects(async () => await assertFileNotExist(_filePath));
      });
    });
  });

  /**
   * assertThrowsChatlogError のテスト。
   *
   * ChatlogError の kind / subindex を直接検証し、インスタンスを返す動作を検証する。
   */
  describe('assertThrowsChatlogError', () => {
    /** 正常系: kind のみ指定、またはkind+subindex が一致する場合。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-TCE-01: kind のみ指定、一致 → エラーなく通過し ChatlogError を返す', () => {
        // act
        const _result = assertThrowsChatlogError(_throwChatlogError('InvalidArgs', 'testSub'), 'InvalidArgs');

        // assert
        assertEquals(_result.kind, 'InvalidArgs');
      });

      it('[Normal] T-AH-TCE-02: kind + subindex 指定、両方一致 → エラーなく通過する', () => {
        // act
        const _result = assertThrowsChatlogError(
          _throwChatlogError('MissingArg', 'myArg'),
          'MissingArg',
          'myArg',
        );

        // assert
        assertEquals(_result.kind, 'MissingArg');
        assertEquals(_result.subindex, 'myArg');
      });
    });

    /** 異常系: ChatlogError でない例外、または kind 不一致の場合。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-TCE-03: ChatlogError でない例外をスロー → AssertionError がスローされる', () => {
        // act & assert
        assertThrows(() => assertThrowsChatlogError(_throwPlainError, 'InvalidArgs'));
      });

      it('[Error] T-AH-TCE-04: kind 不一致 → AssertionError がスローされる', () => {
        // act & assert
        assertThrows(() =>
          assertThrowsChatlogError(
            _throwChatlogError('InvalidArgs', 'sub'),
            'MissingArg',
          )
        );
      });
    });

    /** エッジケース: subindex 省略時の動作。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-AH-TCE-05: subindex 省略時 → subindex を問わず通過する', () => {
        // act & assert (no throw for any subindex value)
        assertThrowsChatlogError(_throwChatlogError('InvalidArgs', 'anyValue'), 'InvalidArgs');
        assertThrowsChatlogError(_throwChatlogError('InvalidArgs', ''), 'InvalidArgs');
      });
    });
  });

  /**
   * assertRejectsChatlogError のテスト。
   *
   * 非同期関数が ChatlogError を reject し、kind / subindex が一致することを検証する。
   */
  describe('assertRejectsChatlogError', () => {
    /** 正常系: kind のみ指定、またはkind+subindex が一致する場合。 */
    describe('When: 正常系', () => {
      it('[Normal] T-AH-RCE-01: kind のみ指定、一致 → 通過し ChatlogError を返す', async () => {
        // act
        const _result = await assertRejectsChatlogError(_rejectChatlogError('InvalidArgs', 'testSub'), 'InvalidArgs');

        // assert
        assertEquals(_result.kind, 'InvalidArgs');
      });

      it('[Normal] T-AH-RCE-02: kind + subindex 指定、両方一致 → 通過する', async () => {
        // act
        const _result = await assertRejectsChatlogError(
          _rejectChatlogError('MissingArg', 'myArg'),
          'MissingArg',
          'myArg',
        );

        // assert
        assertEquals(_result.kind, 'MissingArg');
        assertEquals(_result.subindex, 'myArg');
      });
    });

    /** 異常系: ChatlogError でない reject、または kind 不一致の場合。 */
    describe('When: 異常系', () => {
      it('[Error] T-AH-RCE-03: ChatlogError でない reject → AssertionError がスローされる', async () => {
        // act & assert
        await assertRejects(async () => await assertRejectsChatlogError(_rejectPlainError, 'InvalidArgs'));
      });

      it('[Error] T-AH-RCE-04: kind 不一致 → AssertionError がスローされる', async () => {
        // act & assert
        await assertRejects(async () =>
          await assertRejectsChatlogError(
            _rejectChatlogError('InvalidArgs', 'sub'),
            'MissingArg',
          )
        );
      });
    });
  });
});
