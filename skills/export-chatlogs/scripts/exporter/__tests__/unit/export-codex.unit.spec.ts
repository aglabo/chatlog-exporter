// src: scripts/exporter/__tests__/unit/export-codex.unit.spec.ts
// @(#): exportCodex オーケストレーション関数のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { exportCodex } from '../../codex-exporter.ts';

// ─── Helpers
import { _makeFlowProviders } from '../_helpers/flow-providers.ts';
// types
import type { ExportConfig } from '../../../types/export-config.types.ts';
import type { ExportedSession } from '../../../types/session.types.ts';

// ─── Internal Helpers
// constants
/** codex用 基本設定 */
const BASE_CONFIG: ExportConfig = {
  agent: 'codex',
  outputDir: '/tmp/test-output',
  baseDir: undefined,
  period: undefined,
};

// functions
/** セッション作成 */
function _makeSession(sessionId: string, project: string): ExportedSession {
  return {
    meta: {
      sessionId,
      date: '2026-03-15',
      project,
      slug: '',
      firstUserText: 'テスト用のメッセージです',
    },
    turns: [
      { role: 'user', content: 'テスト用のメッセージです' },
      { role: 'assistant', content: 'テスト用の応答です。' },
    ],
  };
}

// ─── Tests
/**
 * `exportCodex` のユニットテストスイート。
 *
 * Provider パターンで findSessions / parseSession / writeSession を
 * 差し替えることで、実ファイルシステムへの依存なしに動作を検証する。
 * 正常系・スキップ・ファイルなしの各パスを独立したシナリオで網羅し、
 * エクスポート結果カウンタ（exportedCount）と outputPaths の正確性を検証する。
 *
 * テストケース:
 * - T-EC-XC-01: セッション1件が有効 → exportedCount=1, outputPaths に1件
 * - T-EC-XC-02: parseSession が null → exportedCount=0, outputPaths=[]
 * - T-EC-XC-03: findSessions が0件 → exportedCount=0, outputPaths=[]
 * - T-EC-XC-04: 3件中2件有効 → exportedCount=2, outputPaths.length=2
 *
 * @see exportCodex
 */
describe('exportCodex', () => {
  // ─── T-EC-XC-01: 正常にエクスポートされる ───────────────────────────────────

  /**
   * 正常系の基本ケース。
   * セッションファイル1件が parseSession → writeSession の全工程を通過することを検証する。
   * exportedCount=1 かつ outputPaths に書き出し先パスが1件含まれることを確認する。
   */
  describe('Given: セッションファイルが1件あり、parseSession が有効なセッションを返す', () => {
    /** `exportCodex` を呼び出したときの戻り値を検証する。 */
    describe('When: exportCodex(config, providers) を呼び出す', () => {
      const outPath = '/tmp/test-output/codex/2026/2026-03/2026-03-15-test-sess0001.md';

      it('T-EC-XC-01-01: exportedCount が 1', async () => {
        const session = _makeSession('sess-0001', 'my-app');
        const result = await exportCodex(
          BASE_CONFIG,
          _makeFlowProviders([
            ['/fake/session.jsonl', () => Promise.resolve(session), () => Promise.resolve(outPath)],
          ]),
        );
        assertEquals(result.exportedCount, 1);
      });
    });
  });

  // ─── T-EC-XC-02: parseSession が null → スキップ ───────────────────────────

  /**
   * parseSession が null を返すスキップ仕様の検証。
   * 期間外・内容なしなどの理由でパース結果が null になった場合、
   * exportedCount=0 かつ outputPaths が空配列になることを確認する。
   */
  describe('Given: parseSession が null を返す（スキップ対象セッション）', () => {
    /** `exportCodex` を呼び出したときの戻り値を検証する。 */
    describe('When: exportCodex(config, providers) を呼び出す', () => {
      it('T-EC-XC-02-01: exportedCount が 0', async () => {
        const result = await exportCodex(
          BASE_CONFIG,
          _makeFlowProviders([
            ['/fake/skipped.jsonl', () => Promise.resolve(null), () => Promise.resolve('')],
          ]),
        );
        assertEquals(result.exportedCount, 0);
      });
    });
  });

  // ─── T-EC-XC-03: セッションファイルが0件 ─────────────────────────────────────

  /**
   * 入力ファイルが0件の境界値ケース。
   * findSessions が空配列を返す状況で、exportedCount=0 かつ outputPaths=[] になることを検証する。
   * 処理対象なしでも正常終了（例外なし）することを確認する。
   */
  describe('Given: findSessions がファイルを1件も返さない', () => {
    /** `exportCodex` を呼び出したときの戻り値を検証する。 */
    describe('When: exportCodex(config, providers) を呼び出す', () => {
      it('T-EC-XC-03-01: exportedCount が 0', async () => {
        const result = await exportCodex(BASE_CONFIG, _makeFlowProviders([]));
        assertEquals(result.exportedCount, 0);
      });
    });
  });

  // ─── T-EC-XC-04: 複数セッションのカウント ────────────────────────────────────

  /**
   * 複数ファイル混在（有効・スキップ）ケース。
   * 有効2件・スキップ1件が混在する入力に対し、
   * exportedCount=2 かつ outputPaths.length=2 になることを検証する。
   */
  describe('Given: セッションファイルが3件あり、2件は有効で1件はスキップ', () => {
    /** `exportCodex` を呼び出したときの戻り値を検証する。 */
    describe('When: exportCodex(config, providers) を呼び出す', () => {
      const session = _makeSession('session-0001', 'my-app');

      it('T-EC-XC-04-01: exportedCount が 2', async () => {
        const result = await exportCodex(
          BASE_CONFIG,
          _makeFlowProviders([
            ['/fake/a.jsonl', () => Promise.resolve(session), () => Promise.resolve('/tmp/out.md')],
            ['/fake/b.jsonl', () => Promise.resolve(null), () => Promise.resolve('')],
            ['/fake/c.jsonl', () => Promise.resolve(session), () => Promise.resolve('/tmp/out.md')],
          ]),
        );
        assertEquals(result.exportedCount, 2);
      });
    });
  });
});
