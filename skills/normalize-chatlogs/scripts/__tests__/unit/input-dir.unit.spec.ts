// src: scripts/__tests__/unit/normalize-chatlogs.input-dir.unit.spec.ts
// @(#): 入力ディレクトリ解決のユニットテスト
//       対象: resolveInputDir, validateInputDir
//       テスト種別: 正常系 / 異常系 / エッジケース
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import {
  resolveInputDir,
  validateInputDir,
} from '../../normalize-chatlogs.ts';

// ─── Helpers
// types
import type { StatSyncProvider } from '../../../../_scripts/types/providers.types.ts';

// ─── resolveInputDir 単体テスト ────────────────────────────────────────────────

/**
 * resolveInputDir の単体テスト。
 * 純粋関数として、FS副作用なしにパス解決結果 (ResolveResult) を返すことを検証する。
 */
describe('resolveInputDir', () => {
  // ─── T-01: --dir 指定 ──────────────────────────────────────────────────────

  /** 正常系: --dir 指定時に { ok: true, dir: <指定値> } が返る */
  describe('Given: --dir オプションが指定される', () => {
    it('Then: [正常] - { ok: true, dir: <指定値> } を返す', () => {
      const result = resolveInputDir({ chatlogsDir: '/some/path' });

      assertEquals(result, { ok: true, dir: '/some/path' });
    });
  });

  // ─── T-02: --agent + --yearMonth 指定 ─────────────────────────────────────

  /** 正常系: chatlogs/<agent>/<year>/<period> のパスが返る */
  describe('Given: --agent と --period が指定される', () => {
    it('Then: [正常] - { ok: true, dir: "chatlogs/<agent>/<year>/<period>" } を返す', () => {
      const result = resolveInputDir({ agent: 'claude', period: '2026-03' });

      assertEquals(result, { ok: true, dir: 'chatlogs/claude/2026/2026-03' });
    });
  });

  // ─── T-03: --dir と --agent/--yearMonth の優先順位 ────────────────────────

  /** エッジケース: --dir が --agent/--period より優先される */
  describe('Given: --dir と --agent/--period が両方指定される', () => {
    it('Then: [エッジケース] - --dir が優先されて { ok: true, dir: <dir値> } を返す', () => {
      const result = resolveInputDir({ chatlogsDir: '/explicit/dir', agent: 'claude', period: '2026-03' });

      assertEquals(result, { ok: true, dir: '/explicit/dir' });
    });
  });

  // ─── T-04: 引数なし ────────────────────────────────────────────────────────

  /** 異常系: 必須オプションなしで { ok: false, error: ... } が返る */
  describe('Given: 引数が空オブジェクト {}', () => {
    it('Then: [異常] - { ok: false, error: エラーメッセージ } を返す', () => {
      const result = resolveInputDir({});

      assertEquals(result, {
        ok: false,
        error: '--chatlogs-dir or (--agent and --period) must be specified',
      });
    });
  });

  // ─── T-05: --agent のみ指定（yearMonth なし） ─────────────────────────────

  /** 異常系: --period が欠けているため { ok: false, error: ... } が返る */
  describe('Given: --agent のみ指定（--period なし）', () => {
    it('Then: [異常] - { ok: false, error: エラーメッセージ } を返す', () => {
      const result = resolveInputDir({ agent: 'claude' });

      assertEquals(result, {
        ok: false,
        error: '--chatlogs-dir or (--agent and --period) must be specified',
      });
    });
  });

  // ─── T-06: --yearMonth のみ指定（agent なし） ─────────────────────────────

  /** 異常系: --agent が欠けているため { ok: false, error: ... } が返る */
  describe('Given: --period のみ指定（--agent なし）', () => {
    it('Then: [異常] - { ok: false, error: エラーメッセージ } を返す', () => {
      const result = resolveInputDir({ period: '2026-03' });

      assertEquals(result, {
        ok: false,
        error: '--chatlogs-dir or (--agent and --period) must be specified',
      });
    });
  });

  // ─── T-07: yearMonth から year の正しい抽出 ───────────────────────────────

  /** エッジケース: period の先頭4文字が year として抽出されパスに反映される */
  describe('Given: period="2026-03" が指定される', () => {
    it('Then: [エッジケース] - dir パスに "2026/2026-03" が含まれる', () => {
      const result = resolveInputDir({ agent: 'claude', period: '2026-03' });

      if (!result.ok) { throw new Error('Expected ok: true'); }
      assertEquals(result.dir.includes('2026/2026-03'), true);
    });
  });
});

// ─── validateInputDir 単体テスト ──────────────────────────────────────────────

describe('validateInputDir', () => {
  describe('Given: statProvider がディレクトリ情報を返す', () => {
    it('Then: [正常] - true を返す', () => {
      const statProvider: StatSyncProvider = (_path: string) => ({ isFile: false, isDirectory: true } as Deno.FileInfo);
      const result = validateInputDir('/any/path', statProvider);

      assertEquals(result, true);
    });
  });

  describe('Given: statProvider が NotFound をスロー', () => {
    it('Then: [異常] - false を返す', () => {
      const statProvider: StatSyncProvider = (_path: string): Deno.FileInfo => {
        throw new Deno.errors.NotFound('not found');
      };
      const result = validateInputDir('/nonexistent/path', statProvider);

      assertEquals(result, false);
    });
  });

  describe('Given: statProvider が undefined として渡される', () => {
    it('Then: [エッジケース] - Deno.statSync をデフォルトとして使用し、存在するディレクトリには true を返す', () => {
      // undefined を明示的に渡す（デフォルト引数のテスト）
      // 実際のFS（カレントディレクトリ "."）を使う
      const result = validateInputDir('.', undefined);

      assertEquals(result, true);
    });
  });

  describe('Given: statProvider が undefined として渡され、存在しないパス', () => {
    it('Then: [エッジケース] - Deno.statSync をデフォルトとして使用し、存在しないパスには false を返す', () => {
      const result = validateInputDir('/nonexistent/path/xyz', undefined);

      assertEquals(result, false);
    });
  });
});
