// src: scripts/__tests__/unit/normalize-chatlogs.output-dir.unit.spec.ts
// @(#): 出力ディレクトリ解決のユニットテスト
//       対象: resolveOutputDir
//       テスト種別: 正常系 / 異常系 / エッジケース
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { resolveOutputDir } from '../../normalize-chatlogs.ts';

// ─── resolveOutputDir 単体テスト ──────────────────────────────────────────────

/**
 * resolveOutputDir の単体テスト。
 * chatlogs 形式パスのミラー構造と任意パスのフォールバックを検証する。
 */
describe('resolveOutputDir', () => {
  // ─── T-20-01: chatlogs 形式 → agent/year/yearMonth がミラーされる ──────────

  /** 正常系: agent/year/yearMonth が outputBase 配下にミラーされ project が末尾に付く */
  describe('Given: inputDir が chatlogs 形式 "chatlogs/<agent>/<year>/<yearMonth>"', () => {
    it('Then: [正常] - <outputBase>/<agent>/<year>/<yearMonth>/<project> を返す', () => {
      const result = resolveOutputDir(
        'chatlogs/claude/2026/2026-03',
        '/out',
        'my-app',
      );

      assertEquals(result, '/out/claude/2026/2026-03/my-app');
    });
  });

  // ─── T-20-02: chatlogs 形式 + project なし → misc フォールバック ─────────

  /** エッジケース: project 未指定時は "misc" がフォールバックとして使われる */
  describe('Given: inputDir が chatlogs 形式で project が undefined', () => {
    it('Then: [エッジケース] - <outputBase>/<agent>/<year>/<yearMonth>/misc を返す', () => {
      const result = resolveOutputDir(
        'chatlogs/gemini/2025/2025-12',
        '/out',
        undefined,
      );

      assertEquals(result, '/out/gemini/2025/2025-12/misc');
    });
  });

  // ─── T-20-03: chatlogs 形式 + project 空文字 → misc フォールバック ────────

  /** エッジケース: project が空文字列の場合も "misc" にフォールバックする */
  describe('Given: inputDir が chatlogs 形式で project が空文字列', () => {
    it('Then: [エッジケース] - <outputBase>/<agent>/<year>/<yearMonth>/misc を返す', () => {
      const result = resolveOutputDir(
        'chatlogs/claude/2026/2026-04',
        '/out',
        '',
      );

      assertEquals(result, '/out/claude/2026/2026-04/misc');
    });
  });

  // ─── T-20-04: 任意パス → <outputBase>/<project> ──────────────────────────

  /** 正常系: chatlogs 形式でない場合は <outputBase>/<project> が返る */
  describe('Given: inputDir が任意パス（chatlogs 形式でない）', () => {
    it('Then: [正常] - <outputBase>/<project> を返す', () => {
      const result = resolveOutputDir(
        '/home/user/chatlogs',
        '/out',
        'custom-project',
      );

      assertEquals(result, '/out/custom-project');
    });
  });

  // ─── T-20-05: 任意パス + project なし → misc フォールバック ─────────────

  /** エッジケース: chatlogs 形式でなく project も未指定の場合は <outputBase>/misc */
  describe('Given: inputDir が任意パスで project が undefined', () => {
    it('Then: [エッジケース] - <outputBase>/misc を返す', () => {
      const result = resolveOutputDir(
        '/home/user/chatlogs',
        '/out',
        undefined,
      );

      assertEquals(result, '/out/misc');
    });
  });

  // ─── T-20-06: agent の値がパスに正確に反映される ─────────────────────────

  /** 正常系: agent 名がそのまま出力パスに反映される */
  describe('Given: inputDir の agent が "chatgpt"', () => {
    it('Then: [正常] - 出力パスに "chatgpt" が含まれる', () => {
      const result = resolveOutputDir(
        'chatlogs/chatgpt/2026/2026-01',
        '/out',
        'proj',
      );

      assertEquals(result, '/out/chatgpt/2026/2026-01/proj');
    });
  });

  // ─── T-20-07: yearMonth が出力パスに正確にミラーされる ───────────────────

  /** 正常系: yearMonth が year/yearMonth として出力パスに正確にミラーされる */
  describe('Given: inputDir の yearMonth が "2025-11"', () => {
    it('Then: [正常] - 出力パスに "2025/2025-11" が含まれる', () => {
      const result = resolveOutputDir(
        'chatlogs/claude/2025/2025-11',
        '/normalized',
        'blog',
      );

      assertEquals(result, '/normalized/claude/2025/2025-11/blog');
    });
  });
});
