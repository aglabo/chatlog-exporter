// src: scripts/__tests__/unit/output-path.unit.spec.ts
// @(#): 出力パス生成関数のユニットテスト
//       対象: buildOutputPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertNotEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildOutputPath } from '../../libs/session-writer.ts';

// ─── Helpers
// types
import type { SessionMeta } from '../../types/session.types.ts';

// ─── Internal Helpers

/**
 * テスト用の `SessionMeta` を生成するファクトリ関数。
 * デフォルト値（sessionId・date・project・slug・firstUserText）を持ち、`overrides` で任意フィールドを上書きできる。
 */
function _makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: 'abc-def-12345678',
    date: '2026-03-15',
    project: 'my-project',
    slug: 'test-slug',
    firstUserText: 'test',
    ...overrides,
  };
}

// ─── Tests

/**
 * `buildOutputPath` のユニットテストスイート。
 *
 * セッションの Markdown ファイル出力パスを生成する関数の動作を検証する。
 * パス構造（agent/YYYY/YYYY-MM/）・slug の包含・sessionId ハッシュ（先頭 8 文字）・
 * 異なる agent 名の各ケースをカバーする。
 *
 * @see buildOutputPath
 */
describe('buildOutputPath', () => {
  /**
   * 基本的なパス構造の生成確認シナリオ。
   *
   * `outputBase/agent/YYYY/YYYY-MM/ファイル名.md` 形式の出力パスに
   * slug と sessionId ハッシュ（先頭 8 文字、ハイフン除去）が含まれることを確認する。
   */
  describe('Given: outputBase="/out", agent="claude", 基本的な meta', () => {
    /** `buildOutputPath` を呼び出したときの出力パスを検証する。 */
    describe('When: buildOutputPath(...) を呼び出す', () => {
      /** T-EC-OP-01: 正しいパス構造を生成する */
      describe('Then: T-EC-OP-01 - 正しいパス構造を生成する', () => {
        it('T-EC-OP-01-03: sessionId 全体の決定的な SHA-256 ハッシュ（先頭12文字）が含まれる', async () => {
          const meta = _makeMeta({ sessionId: 'abc-def-12345678' });
          const result = await buildOutputPath('/out', 'claude', meta, 'test-slug');
          // sessionHash('abc-def-12345678', 12) の先頭12文字
          assertStringIncludes(result, '996c4ad8c274');
        });
      });
    });
  });

  /**
   * date="2026-03-15" から YYYY・YYYY-MM への分割が正しいケース。
   * "2026-03-15" が YYYY="2026" と YYYY-MM="2026-03" に分割されて
   * パスに埋め込まれることを確認する。Obsidian の月別フォルダ整理に直結する仕様。
   */
  describe('Given: date="2026-03-15"', () => {
    it('T-EC-OP-01-05: YYYY="2026", YYYY-MM="2026-03" が正しく埋め込まれる', async () => {
      const meta = _makeMeta({ date: '2026-03-15' });
      const result = await buildOutputPath('/out', 'claude', meta, 'test');
      assertStringIncludes(result, '2026/2026-03/');
    });
  });

  /**
   * sessionId 衝突回避シナリオ。
   *
   * UUIDv7 はタイムスタンプ由来の先頭ビットを持つため、近接した時刻に生成された
   * 複数の sessionId はハイフン除去後の先頭8文字が一致しうる（実際の障害事例）。
   * sessionId 全体を入力とした決定的ハッシュにより、そのようなケースでも
   * 異なるファイル名が生成されることを確認する。
   */
  describe('Given: ハイフン除去後の先頭8文字が一致する2つの UUIDv7 sessionId（実際の障害事例）', () => {
    describe('When: それぞれ buildOutputPath を呼び出す', () => {
      describe('Then: T-EC-OP-02 - 異なるファイル名が生成される（衝突回避）', () => {
        it('T-EC-OP-02-01: 019eff4a-393e-... と 019eff4a-6eb8-... は異なる出力パスになる', async () => {
          const metaA = _makeMeta({ sessionId: '019eff4a-393e-7980-8ced-d185bd4d9e76', date: '2026-06-25' });
          const metaB = _makeMeta({ sessionId: '019eff4a-6eb8-7af2-9735-23025984e328', date: '2026-06-25' });
          const resultA = await buildOutputPath('/out', 'codex', metaA, 'print-hello');
          const resultB = await buildOutputPath('/out', 'codex', metaB, 'print-hello');
          assertNotEquals(resultA, resultB);
        });

        it('T-EC-OP-02-02: 019eff4a-393e-... と 019eff4a-89f9-... は異なる出力パスになる', async () => {
          const metaA = _makeMeta({ sessionId: '019eff4a-393e-7980-8ced-d185bd4d9e76', date: '2026-06-25' });
          const metaC = _makeMeta({ sessionId: '019eff4a-89f9-7582-8978-455f490bf729', date: '2026-06-25' });
          const resultA = await buildOutputPath('/out', 'codex', metaA, 'print-hello');
          const resultC = await buildOutputPath('/out', 'codex', metaC, 'print-hello');
          assertNotEquals(resultA, resultC);
        });
      });
    });
  });
});
