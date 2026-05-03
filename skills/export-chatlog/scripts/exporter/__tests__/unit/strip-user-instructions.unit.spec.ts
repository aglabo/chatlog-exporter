// src: scripts/exporter/__tests__/unit/strip-user-instructions.unit.spec.ts
// @(#): _stripUserInstructions 関数のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { stripUserInstructions } from '../../codex-exporter.ts';

// ─── Tests
/**
 * `_stripUserInstructions` のユニットテストスイート。
 *
 * `<user_instructions>...</user_instructions>` タグで囲まれたシステム設定部分を除去し、
 * ユーザーの実質的な発言テキストのみを返す関数を検証する。
 * ブロック形式（改行区切り）とインライン形式（スペース区切り）の両方に対応し、
 * 複数ブロックの除去・タグなし入力の保護も検証する。
 *
 * テストケース:
 * - T-SUI-01: <user_instructions> のみのテキスト → 空文字列を返す
 * - T-SUI-02: <user_instructions> + 本文テキスト → user_instructions を除いた本文のみ返す
 * - T-SUI-03: <user_instructions> を含まないテキスト → テキストが変更されない
 * - T-SUI-04: 複数の <user_instructions> ブロック → 全ブロックが除去される
 * - T-SUI-05: インライン形式のみ → 空文字列を返す
 * - T-SUI-06: インライン形式 + 本文テキスト → user_instructions を除いた本文のみ返す
 *
 * @see _stripUserInstructions
 */
describe('_stripUserInstructions', () => {
  // ─── T-SUI-01: <user_instructions> のみのテキスト ─────────────────────────────

  /**
   * <user_instructions> ブロックのみで本文が存在しない境界値ケース。
   * 全文がシステム設定の場合、除去後の結果が空文字列になることを検証する。
   */
  describe('Given: <user_instructions>...</user_instructions> のみを含むテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - 空文字列を返す', () => {
        const text = '<user_instructions>\nPlease provide all answers in Japanese\n</user_instructions>';
        const result = stripUserInstructions(text);
        assertEquals(result, '');
      });
    });
  });

  // ─── T-SUI-02: <user_instructions> + 本文テキスト ────────────────────────────

  /**
   * <user_instructions> ブロックと本文テキストが混在する正常系ケース。
   * システム設定部分のみを除去し、ユーザーの実質的な発言（本文）が残ることを検証する。
   */
  describe('Given: <user_instructions> ブロックと本文テキストを含むテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - user_instructions 部分を除いた本文のみ返す', () => {
        const text =
          '<user_instructions>\nPlease provide all answers in Japanese\n</user_instructions>\n\nコードレビューをお願いします';
        const result = stripUserInstructions(text);
        assertEquals(result, 'コードレビューをお願いします');
      });
    });
  });

  // ─── T-SUI-03: <user_instructions> を含まないテキスト ────────────────────────

  /**
   * <user_instructions> タグを含まない通常テキストの保護ケース。
   * タグが存在しない場合、入力テキストを変更せずそのまま返すことを検証する。
   */
  describe('Given: <user_instructions> を含まないテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - テキストが変更されず元の値を返す', () => {
        const text = 'コードレビューをお願いします';
        const result = stripUserInstructions(text);
        assertEquals(result, text);
      });
    });
  });

  // ─── T-SUI-04: 複数の <user_instructions> ブロック ───────────────────────────

  /**
   * 複数の <user_instructions> ブロックが混在するケース。
   * 1件だけでなく、複数のシステム設定ブロックがすべて除去されることを検証する。
   * ブロック間の本文テキストが保持されることも確認する。
   */
  describe('Given: 複数の <user_instructions> ブロックを含むテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - 全ブロックが除去されて本文のみ返す', () => {
        const text = [
          '<user_instructions>',
          'Please provide all answers in Japanese',
          '</user_instructions>',
          '',
          'コードレビューをお願いします',
          '',
          '<user_instructions>',
          'Always use TypeScript',
          '</user_instructions>',
        ].join('\n');
        const result = stripUserInstructions(text);
        assertEquals(result, 'コードレビューをお願いします');
      });
    });
  });

  // ─── T-SUI-05: インライン形式（スペース区切り）のみ ──────────────────────────

  /**
   * インライン形式（改行なし・スペース区切り）の <user_instructions> のみのケース。
   * ブロック形式と異なりスペースで区切られた形式でも除去されることを検証する。
   */
  describe('Given: インライン形式の <user_instructions> のみを含むテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - 空文字列を返す', () => {
        const text = '<user_instructions>  Please provide all answers in Japanese  </user_instructions>';
        const result = stripUserInstructions(text);
        assertEquals(result, '');
      });
    });
  });

  // ─── T-SUI-06: インライン形式 + 本文 ─────────────────────────────────────────

  /**
   * インライン形式の <user_instructions> と本文テキストが混在するケース。
   * インライン形式でも除去が行われ、本文テキストのみが残ることを検証する。
   */
  describe('Given: インライン形式の <user_instructions> と本文テキストを含むテキストを渡す', () => {
    /** `stripUserInstructions(text)` を呼び出したときの戻り値を検証する。 */
    describe('When: _stripUserInstructions(text) を呼び出す', () => {
      it('Then: [正常] - user_instructions 部分を除いた本文のみ返す', () => {
        const text =
          '<user_instructions>  Please provide all answers in Japanese  </user_instructions>\n\nコードレビューをお願いします';
        const result = stripUserInstructions(text);
        assertEquals(result, 'コードレビューをお願いします');
      });
    });
  });
});
