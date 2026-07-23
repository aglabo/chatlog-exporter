// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/line-utils.unit.spec.ts
// @(#): line-utils モジュールのユニットテスト
//       対象: extractLines
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractLines } from '../../line-utils.ts';

// ─── Tests

/**
 * `extractLines` のユニットテストスイート。
 *
 * lines から [startLine, endLine]（1-based, inclusive）の範囲を境界値クランプして
 * 抽出する関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-EL-01-01 〜 T-EL-04-01
 *
 * @see extractLines
 */
describe('extractLines', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-EL-01-01: 通常範囲 startLine=2, endLine=3 のとき該当行を \\n 結合して返す', () => {
      // arrange
      const lines = ['a', 'b', 'c', 'd'];

      // act
      const result = extractLines(lines, 2, 3);

      // assert
      assertEquals(result, 'b\nc');
    });
  });

  describe('When: エッジケース', () => {
    /** entry.content が空文字列のとき `_rebuildSegments`（phase-write.ts）は
     *  `''.split('\n')` = `['']` を extractLines に渡す（実際に到達する呼び出し形状）。
     *  total===0 となる真の空配列 `[]` はどの呼び出し元からも到達しない防御的ガード。 */
    it("[Edge] T-EL-02-01: entry.content が空文字列のとき split('\\n') で得られる [''] を渡すと空文字列を返す", () => {
      // arrange — ''.split('\n') は [] ではなく [''] になる（_rebuildSegments が実際に渡す形状）
      const lines = ''.split('\n');

      // act
      const result = extractLines(lines, 1, 1);

      // assert
      assertEquals(result, '');
    });

    /** startLine > endLine は正常なAI応答では発生しない（segmentChatlogsのsystem promptが
     *  "contiguous and non-overlapping" な範囲を要求している）。AIのハルシネーションや不正な
     *  キャッシュデータに対する防御的ガードの検証。 */
    it('[Edge] T-EL-03-01: startLine=3, endLine=1（startLine > endLine）のとき空文字列を返す', () => {
      // arrange
      const lines = ['a', 'b', 'c'];

      // act
      const result = extractLines(lines, 3, 1);

      // assert
      assertEquals(result, '');
    });

    const _clampCases = [
      { startLine: 0, endLine: 2, expected: 'a\nb', label: 'startLine=0 は 1 にクランプされる' },
      { startLine: -1, endLine: 2, expected: 'a\nb', label: 'startLine=-1 は 1 にクランプされる' },
      { startLine: 2, endLine: 100, expected: 'b\nc', label: 'endLine=100 は total にクランプされる' },
    ] as const;

    for (const { startLine, endLine, expected, label } of _clampCases) {
      it(`[Edge] T-EL-04-01: ${label} (startLine=${startLine}, endLine=${endLine} → '${expected}')`, () => {
        // arrange
        const lines = ['a', 'b', 'c'];

        // act
        const result = extractLines(lines, startLine, endLine);

        // assert
        assertEquals(result, expected);
      });
    }
  });
});
