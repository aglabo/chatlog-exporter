// src: scripts/exporter/__tests__/functional/parse-chatgpt-conversation.functional.spec.ts
// @(#): parseChatGPTConversation の機能テスト
//       対象: parseChatGPTConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// parseChatGPTConversation は非同期関数。
// ExportConfig → PeriodRange のフィルタと mapping トラバースに加え、
// sessionId 欠落時は resolveSessionId（generateHash）で代替値を生成するため await が必要。

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';

// ─── Test target
import { parsePeriod } from '../../../libs/period-filter.ts';
import { parseChatGPTConversation } from '../../chatgpt-exporter.ts';

// ─── Helpers
// types
import type { PeriodRange } from '../../../types/filter.types.ts';
import type { ChatGPTConversation } from '../../types/chatgpt-entry.types.ts';

// ─── Internal Helpers

const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

/** 正常な2ターン会話を含む ChatGPTConversation を生成するヘルパー */
function _makeNormalConv(): ChatGPTConversation {
  return {
    id: 'conv-001',
    conversation_id: 'conv-uuid-0001',
    create_time: 1742000000, // 2025-03-14 頃
    title: 'テスト会話',
    mapping: {
      'sys': {
        id: 'sys',
        message: {
          id: 'msg-sys',
          author: { role: 'system' },
          create_time: null,
          content: { content_type: 'text', parts: [''] },
        },
        parent: null,
        children: ['user-1'],
      },
      'user-1': {
        id: 'user-1',
        message: {
          id: 'msg-user-1',
          author: { role: 'user' },
          create_time: 1742000001,
          content: { content_type: 'text', parts: ['コードレビューをお願いします'] },
        },
        parent: 'sys',
        children: ['assist-1'],
      },
      'assist-1': {
        id: 'assist-1',
        message: {
          id: 'msg-assist-1',
          author: { role: 'assistant' },
          create_time: 1742000010,
          content: { content_type: 'text', parts: ['コードを確認しました。'] },
        },
        parent: 'user-1',
        children: [],
      },
    },
    current_node: 'assist-1',
  };
}

// ─── Tests

/**
 * `parseChatGPTConversation` の機能テストスイート。
 *
 * 非同期関数として動作し、ChatGPTConversation と PeriodRange を受け取り、
 * ExportedSession または null を返す関数を検証する。
 * period フィルタ・isSkippable 判定・current_node フォールバックの各仕様をカバーする。
 *
 * @see parseChatGPTConversation
 * @see parsePeriod
 */
describe('parseChatGPTConversation', () => {
  // ─── T-EC-GP-01: 正常会話オブジェクト・全期間 ─────────────────────────────

  /**
   * 正常な会話オブジェクトと全期間フィルタを組み合わせた正常系ケース。
   * mapping トラバース・meta 生成・turns 構築の各工程が正しく動作することを検証する。
   */
  describe('Given: 正常な会話オブジェクト + 全期間', () => {
    /** `parseChatGPTConversation` を呼び出したときの戻り値を検証する。 */
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // ─── T-EC-GP-01-01: 非 null を返す ───────────────────────────────────

      it('T-EC-GP-01-01: null でない ExportedSession を返す', async () => {
        const conv = _makeNormalConv();
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertNotNull(result);
      });

      // ─── T-EC-GP-01-02: meta.sessionId === conv.conversation_id ──────────

      it('T-EC-GP-01-02: meta.sessionId が conv.conversation_id と一致する', async () => {
        const conv = _makeNormalConv();
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.meta.sessionId, conv.conversation_id);
      });

      // ─── T-EC-GP-01-03: meta.project === conv.title ──────────────────────

      it('T-EC-GP-01-03: meta.project が conv.title と一致する', async () => {
        const conv = _makeNormalConv();
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.meta.project, conv.title);
      });

      // ─── T-EC-GP-01-04: turns.length が user+assistant の数 ──────────────

      it('T-EC-GP-01-04: turns.length が 2（user1 + assistant1）', async () => {
        const conv = _makeNormalConv();
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.turns.length, 2);
      });
    });
  });

  // ─── T-EC-GP-02: 全 user ターンが isSkippable 対象 → null ────────────────

  /**
   * 全ての user ターンが isSkippable 対象になる会話のスキップ仕様の検証。
   * 有効な user 発言が存在しない会話（"yes" などの短文肯定のみ）は
   * null を返してスキップされることを検証する。
   */
  describe('Given: 全 user ターンが isSkippable 対象の会話', () => {
    /** `parseChatGPTConversation` を呼び出したときの戻り値を検証する。 */
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // null 理由: all-turns-skipped（有効 user ターンなし）
      it('T-EC-GP-02-01: null を返す', async () => {
        const conv: ChatGPTConversation = {
          id: 'conv-skip',
          conversation_id: 'conv-uuid-skip',
          create_time: 1742000000,
          title: 'スキップ会話',
          mapping: {
            'user-1': {
              id: 'user-1',
              message: {
                id: 'msg-user-1',
                author: { role: 'user' },
                create_time: 1742000001,
                // isSkippable = true: 空文字列に近い短文肯定
                content: { content_type: 'text', parts: ['yes'] },
              },
              parent: null,
              children: [],
            },
          },
          current_node: 'user-1',
        };
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertNull(result);
      });
    });
  });

  // ─── T-EC-GP-03: create_time が期間外 → null ──────────────────────────────

  /**
   * create_time が period 範囲外の会話に対する期間フィルタ仕様の検証。
   * 会話の create_time が parsePeriod で指定した期間に含まれないとき、
   * null を返してスキップされることを検証する。
   */
  describe('Given: create_time が期間外の会話', () => {
    /** 指定期間でフィルタしたときの戻り値を検証する。 */
    describe('When: parsePeriod("2026-03") の期間でフィルタする', () => {
      // null 理由: period-filtered（create_time が期間外）
      it('T-EC-GP-03-01: null を返す', async () => {
        const marchRange = parsePeriod('2026-03');
        // create_time は 2025-03-14 頃（2026-03 期間外）
        const conv = _makeNormalConv();
        const result = await parseChatGPTConversation(conv, marchRange);
        assertNull(result);
      });
    });
  });

  // ─── T-EC-GP-04: current_node 未設定 → フォールバック ─────────────────────

  /**
   * current_node が未設定のフォールバック仕様の検証。
   * current_node が省略された場合、children が空のノード（leaf）を末尾ノードとして使い、
   * 有効な ExportedSession が返ることを検証する。
   */
  describe('Given: current_node が未設定の会話（children が空のノードからフォールバック）', () => {
    /** `parseChatGPTConversation` を呼び出したときの戻り値を検証する。 */
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      it('T-EC-GP-04-01: ExportedSession を返す（null でない）', async () => {
        const conv: ChatGPTConversation = {
          id: 'conv-no-current',
          conversation_id: 'conv-uuid-no-current',
          create_time: 1742000000,
          title: 'フォールバック会話',
          mapping: {
            'user-1': {
              id: 'user-1',
              message: {
                id: 'msg-user-1',
                author: { role: 'user' },
                create_time: 1742000001,
                content: { content_type: 'text', parts: ['フォールバックテスト'] },
              },
              parent: null,
              children: ['assist-1'],
            },
            'assist-1': {
              id: 'assist-1',
              message: {
                id: 'msg-assist-1',
                author: { role: 'assistant' },
                create_time: 1742000010,
                content: { content_type: 'text', parts: ['回答です。'] },
              },
              parent: 'user-1',
              children: [],
            },
          },
          // current_node を意図的に省略
        };
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertNotNull(result);
      });
    });
  });

  // ─── T-EC-GP-04-02: current_node 未設定 + leaf ノードなし → null ────────

  /**
   * current_node 未設定かつ leaf ノードが存在しない無効 mapping のケース。
   * children が空のノードが1件もない mapping では末尾ノードを特定できないため、
   * null を返すことを検証する。
   */
  describe('Given: current_node が未設定かつ children が空のノードが存在しない会話', () => {
    /** `parseChatGPTConversation` を呼び出したときの戻り値を検証する。 */
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // null 理由: invalid-mapping（有効な末尾ノードが特定できない）
      it('T-EC-GP-04-02: null を返す', async () => {
        const conv: ChatGPTConversation = {
          id: 'conv-no-leaf',
          conversation_id: 'conv-uuid-no-leaf',
          create_time: 1742000000,
          title: '末尾ノードなし',
          mapping: {
            'node-1': {
              id: 'node-1',
              message: {
                id: 'msg-1',
                author: { role: 'user' },
                create_time: 1742000001,
                content: { content_type: 'text', parts: ['テスト'] },
              },
              parent: null,
              // children が空でないため leaf 判定されない（children.length === 0 が leaf 条件）
              // → leafNodes.length === 0 → null
              children: ['non-existent-child'],
            },
          },
          // current_node を意図的に省略
        };
        const result = await parseChatGPTConversation(conv, ALL_PERIOD);
        assertNull(result);
      });
    });
  });

  // ─── T-EC-GP-05: conversation_id 欠落 → 一意な代替値が生成される ─────────

  /**
   * `conversation_id` が欠落した2つの会話をパースするシナリオ。
   * 同日・同タイトルの会話で sessionId が欠落すると、単純な固定値フォールバックでは
   * 出力ファイル名が衝突しキャッシュが誤って共有されてしまう。
   * `resolveSessionId` により、欠落時は呼び出しごとに異なる代替値が生成されることを確認する。
   */
  describe('Given: conversation_id が欠落した2つの会話オブジェクト', () => {
    /** `parseChatGPTConversation` を各会話に対して呼び出したときの戻り値を検証する。 */
    describe('When: 2つの会話をそれぞれ parseChatGPTConversation(conv, allPeriod) でパースする', () => {
      it('T-EC-GP-05-01: convA と convB の meta.sessionId が異なる（出力ファイル名衝突を回避する）', async () => {
        const _makeConvWithoutId = (id: string): ChatGPTConversation => ({
          ..._makeNormalConv(),
          id,
          // conversation_id は string 型だが、欠落時の実データ（undefined）を意図的に再現する
          conversation_id: undefined as unknown as string,
        });
        const convA = _makeConvWithoutId('conv-a');
        const convB = _makeConvWithoutId('conv-b');
        const sessionA = await parseChatGPTConversation(convA, ALL_PERIOD);
        const sessionB = await parseChatGPTConversation(convB, ALL_PERIOD);
        assertNotNull(sessionA);
        assertNotNull(sessionB);
        assertNotEquals(sessionA!.meta.sessionId, sessionB!.meta.sessionId);
      });
    });
  });
});
