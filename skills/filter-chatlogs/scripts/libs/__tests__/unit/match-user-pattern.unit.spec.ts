// src: scripts/libs/__tests__/unit/match-user-pattern.unit.spec.ts
// @(#): _matchUserPattern のユニットテスト
//       対象: _matchUserPattern
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNull } from '../../../../../_scripts/libs/testing/assert.ts';

// ─── Test target
import { _matchUserPattern } from '../../../libs/classify-file.ts';

// ─── Helpers
// constants
import { ConversationRole } from '../../../../../_scripts/types/conversation-role.const.types.ts';
// types
import type { NoiseConversationPattern } from '../../../types/patterns.types.ts';

// ─── Internal Helpers

// constants
/** user エントリのみを持つ単一パターン定義。`/commit` で始まる user テキストにマッチする。 */
const _userOnlyPattern: NoiseConversationPattern[] = [{
  label: 'userのみパターン',
  entries: [{ target: ConversationRole.user, pattern: /^\/commit\b/ }],
}];

/** 複数パターンを持つ定義。最初のパターンは `/commit`、2番目は `hello` にマッチする。 */
const _multiPatterns: NoiseConversationPattern[] = [
  {
    label: '最初のパターン',
    entries: [{ target: ConversationRole.user, pattern: /^\/commit\b/ }],
  },
  {
    label: '2番目のパターン',
    entries: [{ target: ConversationRole.user, pattern: /^hello\b/ }],
  },
];

/** assistant エントリのみを持つパターン定義。user エントリが存在しないためスキップされる。 */
const _assistantOnlyPattern: NoiseConversationPattern[] = [{
  label: 'assistantのみパターン',
  entries: [{ target: ConversationRole.assistant, pattern: /^ok$/i }],
}];

/** user エントリと assistant エントリを持つ混在パターン定義。user 条件のみ評価される。 */
const _mixedPattern: NoiseConversationPattern[] = [{
  label: '混在パターン',
  entries: [
    { target: ConversationRole.user, pattern: /^\/commit\b/ },
    { target: ConversationRole.assistant, pattern: /^ok$/i },
  ],
}];

/** user に複数エントリ（AND 条件）を持つパターン定義。全エントリが一致した場合のみマッチする。 */
const _multiEntryPattern: NoiseConversationPattern[] = [{
  label: 'ANDパターン',
  entries: [
    { target: ConversationRole.user, pattern: /fix/ },
    { target: ConversationRole.user, pattern: /bug/ },
  ],
}];

// ─── Tests

/**
 * `_matchUserPattern` のユニットテストスイート。
 *
 * text 文字列を受け取り、user エントリのパターンにマッチするか検証する。
 * assistant エントリは無視される。
 *
 * テスト ID 範囲: T-PF-UP-01 〜 T-PF-UP-04
 *
 * @see _matchUserPattern
 */
describe('_matchUserPattern', () => {
  /**
   * `正常系` のパターンマッチテスト。
   *
   * user エントリにマッチする場合・全パターン不一致の場合を検証する。
   */
  describe('When: 正常系', () => {
    /** 単一パターン・単一 user エントリにマッチする場合。 */
    it('[Normal] T-PF-UP-01-01: 単一パターン・単一 user エントリにマッチ → label を返す', () => {
      const result = _matchUserPattern('/commit fix bug', _userOnlyPattern);

      assertEquals(result, 'userのみパターン');
    });

    /** 複数パターン中の最初のマッチを返す場合。 */
    it('[Normal] T-PF-UP-01-02: 複数パターン中の最初のマッチ → そのパターンの label を返す', () => {
      const result = _matchUserPattern('hello world', _multiPatterns);

      assertEquals(result, '2番目のパターン');
    });

    /** 全パターン不一致の場合。 */
    it('[Normal] T-PF-UP-02-01: 全パターン不一致 → null を返す', () => {
      const result = _matchUserPattern('通常のテキスト', _userOnlyPattern);

      assertNull(result);
    });
  });

  /**
   * `異常系` のパターンマッチテスト。
   *
   * user 以外の target のみを持つパターンがスキップされる場合を検証する。
   */
  describe('When: 異常系', () => {
    /** パターンに user 以外（assistant）の target のみが存在する場合。 */
    it('[Error] T-PF-UP-03-01: パターンに user 以外（assistant）の target のみ → スキップされ null を返す', () => {
      const result = _matchUserPattern('ok', _assistantOnlyPattern);

      assertNull(result);
    });
  });

  /**
   * `エッジケース` のパターンマッチテスト。
   *
   * 複数 user エントリの AND 条件・混在エントリ・空 patterns 配列を検証する。
   */
  describe('When: エッジケース', () => {
    /** 複数エントリ（AND 条件）で全エントリ一致する場合。 */
    it('[Edge] T-PF-UP-04-01: 複数 user エントリ（AND 条件）→ 全エントリ一致時のみ label を返す', () => {
      const result = _matchUserPattern('fix bug in code', _multiEntryPattern);

      assertEquals(result, 'ANDパターン');
    });

    /** 複数エントリ（AND 条件）で一部不一致の場合。 */
    it('[Edge] T-PF-UP-04-02: 複数 user エントリ（AND 条件）→ 一部不一致 → null を返す', () => {
      const result = _matchUserPattern('fix error in code', _multiEntryPattern);

      assertNull(result);
    });

    /** 空の patterns 配列の場合。 */
    it('[Edge] T-PF-UP-04-03: 空の patterns 配列 → null を返す', () => {
      const result = _matchUserPattern('/commit fix bug', []);

      assertNull(result);
    });

    /** user + assistant 混在エントリ → assistant エントリは無視され user 条件のみ評価される場合。 */
    it('[Edge] T-PF-UP-04-04: user+assistant 混在エントリ → assistant エントリは無視され user がマッチすれば label を返す', () => {
      const result = _matchUserPattern('/commit fix bug', _mixedPattern);

      assertEquals(result, '混在パターン');
    });
  });
});
