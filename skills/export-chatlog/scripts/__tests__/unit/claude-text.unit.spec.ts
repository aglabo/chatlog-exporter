// src: scripts/__tests__/unit/claude-text.unit.spec.ts
// @(#): Claude テキスト抽出関数のユニットテスト
//       対象: extractClaudeUserText, extractClaudeAssistantText
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  extractClaudeAssistantText,
  extractClaudeUserText,
} from '../../../../export-chatlog/scripts/exporter/claude-exporter.ts';

// ─── Tests

// ─── extractClaudeUserText ────────────────────────────────────────────────────

/**
 * `extractClaudeUserText` のユニットテストスイート。
 *
 * Claude JSONL エントリの content フィールドからユーザーテキストを抽出する関数の動作を検証する。
 * 文字列型・配列型・null/undefined の各入力型と、<local-command-stdout>・IDE 系・
 * tool_result のフィルタリング動作をカバーする。
 *
 * @see extractClaudeUserText
 */
describe('extractClaudeUserText', () => {
  /**
   * 文字列 content をそのまま返す正常系の基本ケース。
   * content が string 型のとき、配列処理を経ずに直接返すことを確認する。
   */
  describe('Given: 文字列 content "こんにちは"', () => {
    it('T-EC-CT-01-01: "こんにちは" を返す', () => {
      assertEquals(extractClaudeUserText('こんにちは'), 'こんにちは');
    });
  });

  /**
   * `<local-command-stdout` プレフィックスをスキップして空文字を返すケース。
   * シェルコマンド出力をユーザー発言と誤認しないためのフィルタ仕様の確認。
   */
  describe('Given: <local-command-stdout で始まる文字列', () => {
    it('T-EC-CT-01-02: "" を返す', () => {
      assertEquals(extractClaudeUserText('<local-command-stdout some content'), '');
    });
  });

  /**
   * type="text" のアイテム配列を半角スペースで結合して返すケース。
   * content が配列型のとき text アイテムのみを抽出してスペース結合することを確認する。
   */
  describe('Given: type="text" のアイテム配列', () => {
    it('T-EC-CT-01-03: テキストを結合して返す', () => {
      const content = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ];
      assertEquals(extractClaudeUserText(content), 'hello world');
    });
  });

  /**
   * tool_result アイテムのみの配列を空文字で返すフィルタ仕様の確認。
   * ツール実行結果はユーザー発言テキストとして扱わないことを確認する。
   */
  describe('Given: type="tool_result" のみの配列', () => {
    it('T-EC-CT-01-04: "" を返す', () => {
      const content = [
        { type: 'tool_result', content: 'some result' },
      ];
      assertEquals(extractClaudeUserText(content), '');
    });
  });

  /**
   * `<system-reminder` プレフィックスを持つ text アイテムをスキップするケース。
   * システムリマインダーがユーザー発言に混入した場合の除外仕様を確認する。
   */
  describe('Given: <system-reminder で始まる text アイテム', () => {
    it('T-EC-CT-01-05: そのアイテムをスキップして "" を返す', () => {
      const content = [
        { type: 'text', text: '<system-reminder some content' },
      ];
      assertEquals(extractClaudeUserText(content), '');
    });
  });

  /**
   * `<ide_opened_file` プレフィックスを持つ text アイテムをスキップするケース。
   * IDE 連携タグはユーザー発言テキストとして扱わないフィルタ仕様を確認する。
   */
  describe('Given: <ide_opened_file で始まる text アイテム', () => {
    it('T-EC-CT-01-06: そのアイテムをスキップして "" を返す', () => {
      const content = [
        { type: 'text', text: '<ide_opened_file path="test.ts">' },
      ];
      assertEquals(extractClaudeUserText(content), '');
    });
  });

  /**
   * null / undefined の両方に対して空文字を返す防御的境界値ケース。
   * Claude JSONL の content フィールドが欠落している場合でも安全に動作することを確認する。
   */
  describe('Given: null / undefined', () => {
    it('T-EC-CT-01-07: null の場合 "" を返す', () => {
      assertEquals(extractClaudeUserText(null), '');
    });

    it('T-EC-CT-01-08: undefined の場合 "" を返す', () => {
      assertEquals(extractClaudeUserText(undefined), '');
    });
  });
});

// ─── extractClaudeAssistantText ───────────────────────────────────────────────

/**
 * `extractClaudeAssistantText` のユニットテストスイート。
 *
 * Claude JSONL エントリの content フィールドからアシスタントテキストを抽出する関数の動作を検証する。
 * 文字列型・配列型での改行結合・tool_use の除外・null/undefined の各ケースをカバーする。
 *
 * @see extractClaudeAssistantText
 */
describe('extractClaudeAssistantText', () => {
  /**
   * 文字列 content をそのまま返す正常系の基本ケース。
   * content が string 型のとき、配列処理を経ずに直接返すことを確認する。
   */
  describe('Given: 文字列 content "回答です"', () => {
    it('T-EC-CT-02-01: "回答です" を返す', () => {
      assertEquals(extractClaudeAssistantText('回答です'), '回答です');
    });
  });

  /**
   * type="text" のアイテム配列を改行（\n）で結合して返すケース。
   * extractClaudeUserText がスペース結合なのに対し、アシスタントは改行結合になる仕様を確認する。
   */
  describe('Given: type="text" のアイテム配列', () => {
    it('T-EC-CT-02-02: テキストを改行結合して返す', () => {
      const content = [
        { type: 'text', text: '第1段落' },
        { type: 'text', text: '第2段落' },
      ];
      const result = extractClaudeAssistantText(content);
      assertEquals(result, '第1段落\n第2段落');
    });
  });

  /**
   * tool_use アイテムのみの配列を空文字で返すフィルタ仕様の確認。
   * ツール実行（Bash 呼び出し等）はアシスタントテキストとして抽出しないことを確認する。
   */
  describe('Given: type="tool_use" のみの配列', () => {
    it('T-EC-CT-02-03: "" を返す', () => {
      const content = [
        { type: 'tool_use', id: 'tu-001', name: 'bash', input: {} },
      ];
      assertEquals(extractClaudeAssistantText(content), '');
    });
  });

  /**
   * null / undefined の両方に対して空文字を返す防御的境界値ケース。
   * アシスタントエントリの content が欠落している場合でも安全に動作することを確認する。
   */
  describe('Given: null / undefined', () => {
    it('T-EC-CT-02-04: null の場合 "" を返す', () => {
      assertEquals(extractClaudeAssistantText(null), '');
    });

    it('T-EC-CT-02-05: undefined の場合 "" を返す', () => {
      assertEquals(extractClaudeAssistantText(undefined), '');
    });
  });
});
