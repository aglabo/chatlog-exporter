// src: scripts/__tests__/unit/skip-rules.unit.spec.ts
// @(#): スキップルール関数のユニットテスト
//       対象: isShortAffirmation, isSkippable
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  isShortAffirmation,
  isSkippable,
} from '../../libs/skip-rules.ts';

// ─── Tests
/**
 * `isShortAffirmation` のユニットテストスイート。
 *
 * 入力テキストが「短文肯定」に該当するかを判定する関数を検証する。
 * 20文字以内かつ SKIP_EXACT セットに含まれる場合のみ true を返す仕様をカバーする。
 * yes/はい などの肯定語・大文字小文字不問・長さ超過での false を検証する。
 *
 * @see isShortAffirmation
 */
describe('isShortAffirmation', () => {
  /**
   * 最も基本的な短文肯定語 "yes" のケース。
   * SKIP_EXACT セットに含まれ20文字以内のため true を返すことを確認する。
   */
  describe('Given: "yes"', () => {
    it('T-EC-SU-02-01: true を返す', () => {
      assertEquals(isShortAffirmation('yes'), true);
    });
  });

  /**
   * 日本語の短文肯定語 "はい" のケース。
   * SKIP_EXACT セットが日本語を含むことを確認する。
   */
  describe('Given: "はい"', () => {
    it('T-EC-SU-02-02: true を返す', () => {
      assertEquals(isShortAffirmation('はい'), true);
    });
  });

  /**
   * 大文字の "YES" のケース。
   * toLowerCase() で正規化してから SKIP_EXACT と比較するため true を返すことを確認する。
   */
  describe('Given: 大文字 "YES"', () => {
    it('T-EC-SU-02-03: true を返す（toLowerCase 適用）', () => {
      assertEquals(isShortAffirmation('YES'), true);
    });
  });

  /**
   * 21文字以上の文字列の長さ超過境界値ケース。
   * 20文字の上限を超えると SKIP_EXACT 一致に関わらず false を返すことを確認する。
   */
  describe('Given: 21文字以上の文字列', () => {
    it('T-EC-SU-02-04: false を返す（長さ超過）', () => {
      assertEquals(isShortAffirmation('a'.repeat(21)), false);
    });
  });

  /**
   * SKIP_EXACT セットに含まれない通常単語 "hello" のケース。
   * 長さ条件を満たしても SKIP_EXACT に非該当なら false を返すことを確認する。
   */
  describe('Given: "hello"（SKIP_EXACT に非該当）', () => {
    it('T-EC-SU-02-05: false を返す', () => {
      assertEquals(isShortAffirmation('hello'), false);
    });
  });
});

// ─── isSkippable ──────────────────────────────────────────────────────────────

/**
 * `isSkippable` のユニットテストスイート。
 *
 * ユーザー発言テキストがエクスポート対象外か判定する総合関数を検証する。
 * 空文字列・スラッシュコマンド・system-reminder プレフィックス・
 * [Request interrupted] プレフィックス・短文肯定（isShortAffirmation）の
 * 各条件のいずれかに該当すれば true を返す仕様をカバーする。
 *
 * @see isSkippable
 * @see isShortAffirmation
 */
describe('isSkippable', () => {
  /**
   * 空文字列の境界値ケース。
   * 何も入力されていないターンはエクスポート対象外になることを確認する。
   */
  describe('Given: 空文字列 ""', () => {
    it('T-EC-SU-03-01: true を返す', () => {
      assertEquals(isSkippable(''), true);
    });
  });

  /**
   * スラッシュコマンド "/clear" のケース。
   * / で始まるコマンド入力はエクスポート対象外になることを確認する。
   */
  describe('Given: "/clear" プレフィックス', () => {
    it('T-EC-SU-03-02: true を返す', () => {
      assertEquals(isSkippable('/clear'), true);
    });
  });

  /**
   * system-reminder インジェクションプレフィックスのケース。
   * <system-reminder> で始まるテキストはシステムノイズであり除外されることを確認する。
   */
  describe('Given: "<system-reminder>..." プレフィックス', () => {
    it('T-EC-SU-03-03: true を返す', () => {
      assertEquals(isSkippable('<system-reminder>some content'), true);
    });
  });

  /**
   * 短文肯定語 "yes" への isShortAffirmation 委譲のケース。
   * isSkippable が isShortAffirmation を内部で呼び出して true を返すことを確認する。
   */
  describe('Given: "yes"（短文肯定）', () => {
    it('T-EC-SU-03-04: true を返す', () => {
      assertEquals(isSkippable('yes'), true);
    });
  });

  /**
   * スキップ条件に該当しない通常テキストのケース。
   * すべての除外条件を満たさない発言は false を返しエクスポート対象になることを確認する。
   */
  describe('Given: "explain this code"（通常テキスト）', () => {
    it('T-EC-SU-03-05: false を返す', () => {
      assertEquals(isSkippable('explain this code'), false);
    });
  });

  /**
   * /help スラッシュコマンドのケース。
   * /clear と同様、/ プレフィックスを持つコマンドは除外されることを確認する。
   */
  describe('Given: "/help コマンド"', () => {
    it('T-EC-SU-03-06: true を返す', () => {
      assertEquals(isSkippable('/help'), true);
    });
  });

  /**
   * [Request interrupted...] プレフィックスのケース。
   * ユーザーが中断したターンはエクスポート対象外になることを確認する。
   */
  describe('Given: "[Request interrupted..."', () => {
    it('T-EC-SU-03-07: true を返す', () => {
      assertEquals(isSkippable('[Request interrupted by user]'), true);
    });
  });
});
