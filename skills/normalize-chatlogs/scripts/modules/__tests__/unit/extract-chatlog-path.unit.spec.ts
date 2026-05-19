// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/extract-chatlog-path.unit.spec.ts
// @(#): extractChatlogPath のユニットテスト
//       対象: extractChatlogPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { extractChatlogPath } from '../../process-files.ts';

// ─── Tests

/**
 * `extractChatlogPath` のユニットテストスイート。
 *
 * ファイルパスから chatlogs/<agent>/<yyyy>/<yyyy-mm> セグメントを抽出する
 * 純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-ECP-01-01 〜 T-ECP-03-02
 *
 * @see extractChatlogPath
 */
describe('extractChatlogPath', () => {
  /** chatlogs/<agent>/<yyyy>/<yyyy-mm> を含む正常ケース。 */
  describe('When: chatlogs形式パスを含むファイルパス', () => {
    it('[Normal] T-ECP-01-01: chatlogs/claude/2026/2026-04 を含むパスから claude/2026/2026-04 を返す', () => {
      const result = extractChatlogPath('W:/chatlogs/claude/2026/2026-04/chat.md');
      assertEquals(result, 'claude/2026/2026-04');
    });

    it('[Normal] T-ECP-01-02: chatlogs/gpt/2025/2025-12 を含むパスから gpt/2025/2025-12 を返す', () => {
      const result = extractChatlogPath('/home/user/chatlogs/gpt/2025/2025-12/session.md');
      assertEquals(result, 'gpt/2025/2025-12');
    });

    it('[Normal] T-ECP-01-03: 月が異なる同エージェントのパスも正しく返す', () => {
      const result = extractChatlogPath('/chatlogs/claude/2026/2026-03/file.md');
      assertEquals(result, 'claude/2026/2026-03');
    });
  });

  /** chatlogs形式を含まないパスは空文字列を返す正常ケース。 */
  describe('When: chatlogs形式パスを含まないファイルパス', () => {
    it('[Normal] T-ECP-02-01: 任意パスのとき空文字列を返す', () => {
      const result = extractChatlogPath('/tmp/arbitrary/chat.md');
      assertEquals(result, '');
    });

    it('[Normal] T-ECP-02-02: chatlogs/<agent>/<yyyy> のみ（月なし）のとき空文字列を返す', () => {
      const result = extractChatlogPath('/chatlogs/claude/2026/file.md');
      assertEquals(result, '');
    });
  });

  /** エッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-ECP-03-01: ファイル名のみのとき空文字列を返す', () => {
      const result = extractChatlogPath('chat.md');
      assertEquals(result, '');
    });

    it('[Edge] T-ECP-03-02: chatlogs直下にファイルがある（agent/yyyy/yyyy-mmなし）とき空文字列を返す', () => {
      const result = extractChatlogPath('/chatlogs/chat.md');
      assertEquals(result, '');
    });
  });
});
