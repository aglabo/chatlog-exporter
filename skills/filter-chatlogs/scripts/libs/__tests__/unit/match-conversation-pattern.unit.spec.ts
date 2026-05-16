// src: scripts/libs/__tests__/unit/match-conversation-pattern.unit.spec.ts
// @(#): _matchConversationPattern のユニットテスト
//       対象: _matchConversationPattern
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _matchConversationPattern } from '../../../libs/classify-file.ts';

// ─── Helpers
// constants
import { ConversationRole } from '../../../../../_scripts/types/conversation-role.const.types.ts';
// types
import type { Conversation } from '../../../../../_scripts/types/conversation.types.ts';
import type { NoiseConversationPattern } from '../../../types/patterns.types.ts';

// ─── Internal Helpers

// constants
/** user エントリのみを持つパターン定義。`/commit` で始まる user テキストにマッチする。 */
const _userOnlyPatterns: NoiseConversationPattern[] = [{
  label: 'userのみパターン',
  entries: [{ target: ConversationRole.user, pattern: /^\/commit\b/ }],
}];

/** assistant エントリのみを持つパターン定義。大文字小文字無視で `ok` と完全一致する。 */
const _assistantOnlyPatterns: NoiseConversationPattern[] = [{
  label: 'assistantのみパターン',
  entries: [{ target: ConversationRole.assistant, pattern: /^ok$/i }],
}];

/** user + assistant 両エントリを持つパターン定義。両方が一致した場合にのみマッチする。 */
const _bothPatterns: NoiseConversationPattern[] = [{
  label: '両方パターン',
  entries: [
    { target: ConversationRole.user, pattern: /^\/commit\b/ },
    { target: ConversationRole.assistant, pattern: /^ok$/i },
  ],
}];

/** entries が空のパターン定義。常マッチを防ぐ確認用。 */
const _emptyEntryPatterns: NoiseConversationPattern[] = [{
  label: '空エントリパターン',
  entries: [],
}];

// functions
/** ロール・テキストペアから Conversation を生成するヘルパー。 */
const _makeConversation = (turns: Array<{ role: ConversationRole; content: string }>): Conversation => turns;

// ─── Tests

/**
 * `_matchConversationPattern` のユニットテストスイート。
 *
 * Conversation を受け取り user/assistant テキストを自力で取り出すパターンマッチを検証する。
 *
 * テスト ID 範囲: T-PF-MP-01 〜 T-PF-MP-06
 *
 * @see _matchConversationPattern
 */
describe('_matchConversationPattern', () => {
  /**
   * `正常系` のパターンマッチテスト。
   *
   * user エントリのみ・assistant エントリのみ・両方エントリが存在する場合の正常マッチを検証する。
   */
  describe('When: 正常系', () => {
    /** user エントリのみのパターンで user がマッチする場合。 */
    it('[Normal] T-PF-MP-01-01: user エントリのみパターン、user+assistant の会話 → user がマッチすれば label を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '/commit fix bug' },
        { role: 'assistant', content: '任意のassistantテキスト' },
      ]);
      const result = _matchConversationPattern(conversation, _userOnlyPatterns);

      assertEquals(result, 'userのみパターン');
    });

    /** assistant エントリのみのパターンで assistant がマッチする場合。 */
    it('[Normal] T-PF-MP-01-02: assistant エントリのみパターン、user+assistant の会話 → assistant がマッチすれば label を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '任意のuserテキスト' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = _matchConversationPattern(conversation, _assistantOnlyPatterns);

      assertEquals(result, 'assistantのみパターン');
    });

    /** user + assistant 両方のパターンで両方マッチする場合。 */
    it('[Normal] T-PF-MP-02-01: user+assistant 両方パターン、user+assistant の会話 → 両方マッチで label を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '/commit fix bug' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = _matchConversationPattern(conversation, _bothPatterns);

      assertEquals(result, '両方パターン');
    });

    /** 全パターン不一致の場合。 */
    it('[Normal] T-PF-MP-03-01: 全パターン不一致 → null を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '通常のテキスト' },
        { role: 'assistant', content: '通常の応答' },
      ]);
      const result = _matchConversationPattern(conversation, _userOnlyPatterns);

      assertEquals(result, null);
    });
  });

  /**
   * `異常系` のパターンマッチテスト。
   *
   * user+assistant 両方パターンで片方のみマッチする場合を検証する。
   */
  describe('When: 異常系', () => {
    /** user のみマッチして assistant はマッチしない場合。 */
    it('[Error] T-PF-MP-04-01: user+assistant 両方パターンで user のみマッチ → null を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '/commit fix bug' },
        { role: 'assistant', content: '了解しました' },
      ]);
      const result = _matchConversationPattern(conversation, _bothPatterns);

      assertEquals(result, null);
    });

    /** assistant のみマッチして user はマッチしない場合。 */
    it('[Error] T-PF-MP-04-02: user+assistant 両方パターンで assistant のみマッチ → null を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ]);
      const result = _matchConversationPattern(conversation, _bothPatterns);

      assertEquals(result, null);
    });
  });

  /**
   * `エッジケース` のパターンマッチテスト。
   *
   * assistant ターンなし・entries 空・patterns 空・最初のターンが assistant のケースを検証する。
   */
  describe('When: エッジケース', () => {
    /** assistant ターンなし、user エントリのみパターンの場合。 */
    it('[Edge] T-PF-MP-05-01: assistant ターンなし、user エントリのみパターン → user がマッチすれば label を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '/commit fix bug' },
      ]);
      const result = _matchConversationPattern(conversation, _userOnlyPatterns);

      assertEquals(result, 'userのみパターン');
    });

    /** assistant ターンなし、assistant エントリを含むパターンの場合。 */
    it('[Edge] T-PF-MP-05-02: assistant ターンなし、assistant エントリを含むパターン → スキップして null を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '/commit fix bug' },
      ]);
      const result = _matchConversationPattern(conversation, _bothPatterns);

      assertEquals(result, null);
    });

    /** entries が空のパターンの場合。 */
    it('[Edge] T-PF-MP-05-03: entries が空のパターン → null を返す（常マッチしない）', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '任意のuserテキスト' },
        { role: 'assistant', content: '任意のassistantテキスト' },
      ]);
      const result = _matchConversationPattern(conversation, _emptyEntryPatterns);

      assertEquals(result, null);
    });

    /** patterns が空配列の場合。 */
    it('[Edge] T-PF-MP-05-04: patterns が空配列 → null を返す', () => {
      const conversation = _makeConversation([
        { role: 'user', content: '任意のuserテキスト' },
        { role: 'assistant', content: '任意のassistantテキスト' },
      ]);
      const result = _matchConversationPattern(conversation, []);

      assertEquals(result, null);
    });

    /** 最初のターンが assistant（user ターンなし）の場合。 */
    it('[Edge] T-PF-MP-06-01: 最初のターンが assistant（user ターンなし）→ null を返す', () => {
      const conversation = _makeConversation([
        { role: 'assistant', content: 'ok' },
      ]);
      const result = _matchConversationPattern(conversation, _bothPatterns);

      assertEquals(result, null);
    });
  });
});
