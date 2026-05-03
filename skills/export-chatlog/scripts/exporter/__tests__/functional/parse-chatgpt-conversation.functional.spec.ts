// src: scripts/exporter/__tests__/functional/parse-chatgpt-conversation.functional.spec.ts
// @(#): parseChatGPTConversation の機能テスト
//       対象: parseChatGPTConversation
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words conv

// parseChatGPTConversation は同期関数（I/O・副作用なし）。
// ExportConfig → PeriodRange のフィルタと mapping トラバースのみ行う。
// テスト内で await は不要。型として sync であることを明示する。

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

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
 * 正常会話オブジェクト・スキップ対象会話・期間外会話・current_node 未設定の各ケースを検証する。
 *
 * @see parseChatGPTConversation
 * @see parsePeriod
 */
describe('parseChatGPTConversation', () => {
  // ─── T-EC-GP-01: 正常会話オブジェクト・全期間 ─────────────────────────────

  describe('Given: 正常な会話オブジェクト + 全期間', () => {
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // ─── T-EC-GP-01-01: 非 null を返す ───────────────────────────────────

      it('T-EC-GP-01-01: null でない ExportedSession を返す', () => {
        const conv = _makeNormalConv();
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertNotEquals(result, null);
      });

      // ─── T-EC-GP-01-02: meta.sessionId === conv.conversation_id ──────────

      it('T-EC-GP-01-02: meta.sessionId が conv.conversation_id と一致する', () => {
        const conv = _makeNormalConv();
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.meta.sessionId, conv.conversation_id);
      });

      // ─── T-EC-GP-01-03: meta.project === conv.title ──────────────────────

      it('T-EC-GP-01-03: meta.project が conv.title と一致する', () => {
        const conv = _makeNormalConv();
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.meta.project, conv.title);
      });

      // ─── T-EC-GP-01-04: turns.length が user+assistant の数 ──────────────

      it('T-EC-GP-01-04: turns.length が 2（user1 + assistant1）', () => {
        const conv = _makeNormalConv();
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result!.turns.length, 2);
      });
    });
  });

  // ─── T-EC-GP-02: 全 user ターンが isSkippable 対象 → null ────────────────

  describe('Given: 全 user ターンが isSkippable 対象の会話', () => {
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // null 理由: all-turns-skipped（有効 user ターンなし）
      it('T-EC-GP-02-01: null を返す', () => {
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
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result, null);
      });
    });
  });

  // ─── T-EC-GP-03: create_time が期間外 → null ──────────────────────────────

  describe('Given: create_time が期間外の会話', () => {
    describe('When: parsePeriod("2026-03") の期間でフィルタする', () => {
      // null 理由: period-filtered（create_time が期間外）
      it('T-EC-GP-03-01: null を返す', () => {
        const marchRange = parsePeriod('2026-03');
        // create_time は 2025-03-14 頃（2026-03 期間外）
        const conv = _makeNormalConv();
        const result = parseChatGPTConversation(conv, marchRange);
        assertEquals(result, null);
      });
    });
  });

  // ─── T-EC-GP-04: current_node 未設定 → フォールバック ─────────────────────

  describe('Given: current_node が未設定の会話（children が空のノードからフォールバック）', () => {
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      it('T-EC-GP-04-01: ExportedSession を返す（null でない）', () => {
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
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertNotEquals(result, null);
      });
    });
  });

  // ─── T-EC-GP-04-02: current_node 未設定 + leaf ノードなし → null ────────

  describe('Given: current_node が未設定かつ children が空のノードが存在しない会話', () => {
    describe('When: parseChatGPTConversation(conv, allPeriod) を呼び出す', () => {
      // null 理由: invalid-mapping（有効な末尾ノードが特定できない）
      it('T-EC-GP-04-02: null を返す', () => {
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
        const result = parseChatGPTConversation(conv, ALL_PERIOD);
        assertEquals(result, null);
      });
    });
  });
});
