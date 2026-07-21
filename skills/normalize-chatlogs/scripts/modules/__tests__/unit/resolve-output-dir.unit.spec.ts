// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/resolve-output-dir.unit.spec.ts
// @(#): resolveOutputDir のユニットテスト
//       対象: resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { resolveOutputDir } from '../../../phases/phase-write.ts';

// ─── Tests

/**
 * `resolveOutputDir` のユニットテストスイート。
 *
 * filePath から chatlog パスを取得して outputBase + chatlogPath + project を
 * 組み立てる純粋関数の正常系・エッジケースを検証する。
 *
 * テスト ID 範囲: T-NCH-ROD-01-01 〜 T-NCH-ROD-03-02
 *
 * @see resolveOutputDir
 */
describe('resolveOutputDir', () => {
  /** chatlogs形式パスを含む filePath の正常ケース。 */
  describe('When: chatlogs形式パスを含む filePath', () => {
    it('[Normal] T-NCH-ROD-01-01: chatlogs/claude/2026/2026-04 を含む filePath のとき outputBase/claude/2026/2026-04/project を返す', () => {
      const result = resolveOutputDir('base', 'W:/chatlogs/claude/2026/2026-04/chat.md', 'my-app');
      assertEquals(result, 'base/claude/2026/2026-04/my-app');
    });

    it('[Normal] T-NCH-ROD-01-02: 異なるエージェント・月でも正しいパスを返す', () => {
      const result = resolveOutputDir('base', '/chatlogs/gpt/2025/2025-12/session.md', 'proj');
      assertEquals(result, 'base/gpt/2025/2025-12/proj');
    });
  });

  /** chatlogs形式を含まない filePath の正常ケース。 */
  describe('When: chatlogs形式を含まない filePath', () => {
    it('[Normal] T-NCH-ROD-02-01: 任意パスの filePath のとき outputBase/project を返す', () => {
      const result = resolveOutputDir('base', '/tmp/arbitrary/chat.md', 'test');
      assertEquals(result, 'base/test');
    });
  });

  /** project が undefined のエッジケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-NCH-ROD-03-01: project=undefined かつ chatlogs形式のとき outputBase/chatlogPath/misc を返す', () => {
      const result = resolveOutputDir('base', '/chatlogs/claude/2026/2026-04/chat.md', undefined);
      assertEquals(result, 'base/claude/2026/2026-04/misc');
    });

    it('[Edge] T-NCH-ROD-03-02: project=undefined かつ任意パスのとき outputBase/misc を返す', () => {
      const result = resolveOutputDir('base', '/tmp/chat.md', undefined);
      assertEquals(result, 'base/misc');
    });
  });
});
