// src: scripts/__tests__/unit/assistant-patterns.unit.spec.ts
// @(#): filter-chatlogs Assistantノイズ判定パターン定数のユニットテスト
//       対象: NOISE_ASSISTANT_PATTERNS
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { NOISE_ASSISTANT_PATTERNS } from '../../constants/patterns/assistant.constants.ts';

// ─── Tests

/**
 * `NOISE_ASSISTANT_PATTERNS` のユニットテストスイート。
 *
 * Assistantノイズ判定パターンが期待するテキストに正しくマッチすることを検証する。
 *
 * テスト ID 範囲: T-FL-AP-01 〜 T-FL-AP-04
 *
 * @see NOISE_ASSISTANT_PATTERNS
 */
describe('NOISE_ASSISTANT_PATTERNS', () => {
  /**
   * 「PRドラフト生成作業ログ」パターンのテストグループ。
   *
   * `^PRドラフトを生成` で始まる Assistant ターンがノイズとして判定されることを検証する。
   */
  describe('PRドラフト生成作業ログ', () => {
    /** PRドラフト生成エントリを取得するヘルパー。 */
    const _entry = NOISE_ASSISTANT_PATTERNS
      .find((p) => p.label === 'PRドラフト生成作業ログ')
      ?.entries[0];

    /** `^PRドラフトを生成` パターンに一致するケース。 */
    describe('When: 正常系', () => {
      it(
        '[Normal] T-FL-AP-01: "PRドラフトを生成するため、まずブランチの変更内容を確認します。" がパターンに一致する',
        () => {
          const text = 'PRドラフトを生成するため、まずブランチの変更内容を確認します。';
          assertEquals(_entry?.pattern?.test(text), true);
        },
      );

      it(
        '[Normal] T-FL-AP-02: "PRドラフトを生成します。pr-generatorエージェントに委譲します。" がパターンに一致する',
        () => {
          const text = 'PRドラフトを生成します。pr-generatorエージェントに委譲します。';
          assertEquals(_entry?.pattern?.test(text), true);
        },
      );
    });

    /** `^PRドラフトを生成` パターンに一致しないケース。 */
    describe('When: 異常系', () => {
      it(
        '[Error] T-FL-AP-03: "PRドラフトが生成されました。" はパターンに一致しない',
        () => {
          const text = 'PRドラフトが生成されました。';
          assertEquals(_entry?.pattern?.test(text), false);
        },
      );

      it(
        '[Error] T-FL-AP-04: "**生成されたPRドラフト**" はパターンに一致しない',
        () => {
          const text = '**生成されたPRドラフト**';
          assertEquals(_entry?.pattern?.test(text), false);
        },
      );
    });
  });
});
