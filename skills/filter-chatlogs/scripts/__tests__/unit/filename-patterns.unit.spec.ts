// src: scripts/__tests__/unit/filename-patterns.unit.spec.ts
// @(#): filter-chatlogs ファイル名ノイズ判定パターン定数のユニットテスト
//       対象: NOISE_FILENAME_PATTERNS, EXCLUDE_FILENAME_PATTERNS_STR
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { EXCLUDE_FILENAME_PATTERNS_STR, NOISE_FILENAME_PATTERNS } from '../../constants/patterns/filename.constants.ts';

// ─── Tests

/**
 * `NOISE_FILENAME_PATTERNS` および `EXCLUDE_FILENAME_PATTERNS_STR` のユニットテストスイート。
 *
 * ファイル名ノイズ判定パターンが期待するファイル名に正しくマッチすることを検証する。
 *
 * テスト ID 範囲: T-FL-FP-01 〜 T-FL-FP-02
 *
 * @see NOISE_FILENAME_PATTERNS
 * @see EXCLUDE_FILENAME_PATTERNS_STR
 */
describe('filename-patterns', () => {
  /**
   * `NOISE_FILENAME_PATTERNS` が `temp-idd-pr-pr-current-draft` を含むファイル名にマッチすることを検証するグループ。
   */
  describe('NOISE_FILENAME_PATTERNS', () => {
    /** PR ドラフト書き直しのログファイルが正規表現パターンにマッチするケース。 */
    describe('When: 正常系', () => {
      it(
        '[Normal] T-FL-FP-01: 2026-04-30-temp-idd-pr-pr-current-draft-... が NOISE_FILENAME_PATTERNS にマッチする',
        () => {
          const filename = '2026-04-30-temp-idd-pr-pr-current-draft-md-pasted-text-1-68-l-f28e906a.md';
          const matched = NOISE_FILENAME_PATTERNS.some((p) => p.test(filename));
          assert(matched);
        },
      );
    });
  });

  /**
   * `EXCLUDE_FILENAME_PATTERNS_STR` が `temp-idd-pr-pr-current-draft` を含むファイル名に部分一致することを検証するグループ。
   */
  describe('EXCLUDE_FILENAME_PATTERNS_STR', () => {
    /** PR ドラフト書き直しのログファイルが文字列パターンに部分一致するケース。 */
    describe('When: 正常系', () => {
      it(
        '[Normal] T-FL-FP-02: 2026-04-30-temp-idd-pr-pr-current-draft-... が EXCLUDE_FILENAME_PATTERNS_STR に含まれる',
        () => {
          const filename = '2026-04-30-temp-idd-pr-pr-current-draft-md-pasted-text-1-68-l-f28e906a.md';
          const matched = EXCLUDE_FILENAME_PATTERNS_STR.some((p) => filename.includes(p));
          assert(matched);
        },
      );
    });
  });
});
