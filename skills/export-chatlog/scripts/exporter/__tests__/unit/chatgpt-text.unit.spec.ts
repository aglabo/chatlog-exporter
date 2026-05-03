// src: scripts/exporter/__tests__/unit/chatgpt-text.unit.spec.ts
// @(#): ChatGPT テキスト抽出関数のユニットテスト
//       対象: extractChatGPTText
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractChatGPTText } from '../../chatgpt-exporter.ts';

// ─── Tests
/**
 * `extractChatGPTText` のユニットテストスイート。
 *
 * ChatGPT メッセージオブジェクトからテキストを抽出する関数の動作を検証する。
 * content_type="text" の parts のみを結合し、それ以外は空文字列を返す仕様をカバーする。
 * null メッセージ・text 型・非 text 型・混在 parts・空配列の各ケースを検証する。
 *
 * @see extractChatGPTText
 */
describe('extractChatGPTText', () => {
  // ─── T-EC-GT-01-01: null メッセージ → '' ──────────────────────────────────

  /**
   * null が引数に渡される防御的境界値ケース。
   * ChatGPT mapping の一部ノードは message=null を持つため、null 安全な処理が必要。
   * null が渡されたとき空文字列を返すことを検証する。
   */
  describe('Given: null メッセージ', () => {
    it('T-EC-GT-01-01: null → ""', () => {
      assertEquals(extractChatGPTText(null), '');
    });
  });

  // ─── T-EC-GT-01-02: content_type: 'text', parts: ['hello', ' world'] → 'hello world' ─

  /**
   * 正常系の基本ケース。
   * content_type="text" で parts に複数の文字列が含まれるとき、
   * それらを結合した文字列が返されることを検証する。
   */
  describe('Given: content_type="text", parts=["hello", " world"]', () => {
    it('T-EC-GT-01-02: parts を結合して返す', () => {
      const message = {
        id: 'msg-01',
        author: { role: 'user' },
        create_time: 1000,
        content: {
          content_type: 'text',
          parts: ['hello', ' world'],
        },
      };
      assertEquals(extractChatGPTText(message), 'hello world');
    });
  });

  // ─── T-EC-GT-01-03: content_type: 'code' → '' ─────────────────────────────

  /**
   * text 以外の content_type に対するフィルタ仕様の検証。
   * content_type="code" のメッセージは parts に内容があっても空文字列を返すことを確認する。
   */
  describe('Given: content_type="code"', () => {
    it('T-EC-GT-01-03: "" を返す', () => {
      const message = {
        id: 'msg-02',
        author: { role: 'assistant' },
        create_time: 2000,
        content: {
          content_type: 'code',
          parts: ['print("hello")'],
        },
      };
      assertEquals(extractChatGPTText(message), '');
    });
  });

  // ─── T-EC-GT-01-04: parts に文字列以外の要素が混在 → 文字列部分のみ結合 ─

  /**
   * parts に非文字列要素（数値・null など）が混在する境界値ケース。
   * ChatGPT API の parts は string 以外の型も含む場合があるため、
   * 文字列のみを抽出して結合することを検証する。
   */
  describe('Given: parts に文字列以外の要素が混在', () => {
    it('T-EC-GT-01-04: 文字列部分のみ結合して返す', () => {
      const message = {
        id: 'msg-03',
        author: { role: 'user' },
        create_time: 3000,
        content: {
          content_type: 'text',
          parts: ['hello', 42, null, 'world'],
        },
      };
      assertEquals(extractChatGPTText(message), 'hello world');
    });
  });

  // ─── T-EC-GT-01-05: parts: [] → '' ────────────────────────────────────────

  /**
   * parts が空配列の境界値ケース。
   * 結合する要素がゼロ件のとき、空文字列が返ることを検証する。
   */
  describe('Given: parts=[] (空配列)', () => {
    it('T-EC-GT-01-05: "" を返す', () => {
      const message = {
        id: 'msg-04',
        author: { role: 'user' },
        create_time: 4000,
        content: {
          content_type: 'text',
          parts: [],
        },
      };
      assertEquals(extractChatGPTText(message), '');
    });
  });
});
