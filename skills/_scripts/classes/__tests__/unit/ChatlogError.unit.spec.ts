// src: skills/_scripts/classes/__tests__/unit/ChatlogError.unit.spec.ts
// @(#): ChatlogError コンストラクタ overload ユニットテスト
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

// ─── Internal Helpers

// constants
/** kind のみで構築したときのメッセージ末尾フォールバック文字列。 */
const _FALLBACK = 'Undefined Error';

// ─── Tests

/**
 * `ChatlogError` クラスのユニットテストスイート。
 *
 * コンストラクタ overload（1引数・2引数・3引数）の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-CLS-CER-01 〜 T-CLS-CER-12
 *
 * @see ChatlogError
 */
describe('ChatlogError', () => {
  /**
   * `constructor` の overload 解決と各プロパティ初期化を検証するテスト。
   *
   * kind のみ・2引数（kind + detail）・3引数（kind + subindex + detail）の
   * 各パターンについて message・subindex・name・instanceof を確認する。
   */
  describe('constructor', () => {
    /** 有効な引数を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-CLS-CER-01: kind のみ → message は "Invalid Yaml: Undefined Error"、subindex は空文字列', () => {
        const err = new ChatlogError('InvalidYaml');
        assertEquals(err.message, `Invalid Yaml: ${_FALLBACK}`);
        assertEquals(err.subindex, '');
      });

      it('[Normal] T-CLS-CER-02: kind + detail → message に detail が入る、subindex は空文字列', () => {
        const err = new ChatlogError('CliError', 'something went wrong');
        assertEquals(err.message, 'CLI Error: something went wrong');
        assertEquals(err.subindex, '');
      });

      it('[Normal] T-CLS-CER-03: kind + subindex + detail → message に detail のみ、this.subindex にパスが入る', () => {
        const err = new ChatlogError('ForbiddenOutput', 'output/foo.md', 'cannot write');
        assertEquals(err.message, 'Forbidden Output: cannot write');
        assertEquals(err.subindex, 'output/foo.md');
      });

      it('[Normal] T-CLS-CER-04: err.name === "ChatlogError"', () => {
        const err = new ChatlogError('MissingArg');
        assertEquals(err.name, 'ChatlogError');
      });

      it('[Normal] T-CLS-CER-05: err instanceof Error === true', () => {
        const err = new ChatlogError('InvalidArgs', 'bad option');
        assertInstanceOf(err, Error);
      });
    });

    /** 境界値・引数パターンの特殊ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-CLS-CER-06: 2引数 → overload 1 に解決、subindex === ""', () => {
        const err = new ChatlogError('TimedOut', 'timed out after 30000ms');
        assertEquals(err.message, 'Timed Out: timed out after 30000ms');
        assertEquals(err.subindex, '');
      });

      it('[Edge] T-CLS-CER-07: detail が空文字列 → message は "CLI Error: "（フォールバックしない）', () => {
        const err = new ChatlogError('CliError', '');
        assertEquals(err.message, 'CLI Error: ');
      });

      it('[Edge] T-CLS-CER-08: 3引数 detail が空文字列 → message は "File Or Dir Not Found: "', () => {
        const err = new ChatlogError('FileDirNotFound', 'some/path', '');
        assertEquals(err.message, 'File Or Dir Not Found: ');
      });

      it('[Edge] T-CLS-CER-09: 3引数 subindex が空文字列 → this.subindex === ""', () => {
        const err = new ChatlogError('InvalidFormat', '', 'bad format');
        assertEquals(err.subindex, '');
        assertEquals(err.message, 'Invalid Format: bad format');
      });

      it('[Edge] T-CLS-CER-10: kind のみ → フォールバック "Undefined Error"（NotInGitRepo で確認）', () => {
        const err = new ChatlogError('NotInGitRepo');
        assertEquals(err.message, `Not In Git Repository: ${_FALLBACK}`);
        assertEquals(err.subindex, '');
      });

      it('[Edge] T-CLS-CER-11: subindex が message 文字列に含まれない', () => {
        const err = new ChatlogError('ForbiddenOutput', 'output/foo.md', 'cannot write to output');
        assertEquals(err.message.includes('output/foo.md'), false);
        assertEquals(err.message, 'Forbidden Output: cannot write to output');
      });

      it('[Edge] T-CLS-CER-12: new ChatlogError("MissingArg", undefined) → message は "Missing Arg: Undefined Error"、subindex === ""', () => {
        const err = new ChatlogError('MissingArg', undefined);
        assertEquals(err.message, `Missing Arg: ${_FALLBACK}`);
        assertEquals(err.subindex, '');
      });
    });
  });
});
