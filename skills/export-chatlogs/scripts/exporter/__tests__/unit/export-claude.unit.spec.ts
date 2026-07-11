// Copyright (c) 2026 atsushifx <http://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// src: scripts/exporter/__tests__/unit/export-claude.unit.spec.ts
// @(#): exportClaude オーケストレーション関数のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { exportClaude } from '../../claude-exporter.ts';

// ─── Helpers
import { _makeFlowProviders } from '../_helpers/flow-providers.ts';
// types
import type { ExportConfig } from '../../../types/export-config.types.ts';
import type { ExportedSession } from '../../../types/session.types.ts';

// ─── Internal Helpers
// constants
/** 基本の ExportConfig */
const BASE_CONFIG: ExportConfig = {
  agent: 'claude',
  exportDir: '/tmp/test-output',
  period: undefined,
};

/** Default の出力パス */
const DEFAULT_OUT_PATH = '/tmp/test-output/claude/2026/2026-03/2026-03-15-test-session0001.md';

// types
/** Session用MockProviderのオプション */
type MockProviderOptions = {
  findSessions?: string[];
  parseSession?: NonNullable<Parameters<typeof exportClaude>[1]>['parseSession'];
  writeSession?: NonNullable<Parameters<typeof exportClaude>[1]>['writeSession'];
};

// functions
/** Session を作成する */
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

/** Mock Provider を作成する  */
function _makeMockProviders(
  options?: MockProviderOptions,
): NonNullable<Parameters<typeof exportClaude>[1]> {
  return {
    findSessions: () => Promise.resolve(options?.findSessions ?? []),
    parseSession: options?.parseSession ?? (() => Promise.resolve(null)),
    writeSession: options?.writeSession ?? (() => Promise.resolve(DEFAULT_OUT_PATH)),
  };
}

// ─── Tests
/**
 * `exportClaude` のユニットテストスイート。
 *
 * Provider パターンで findSessions / parseSession / writeSession を
 * 差し替えることで、実ファイルシステムへの依存なしに動作を検証する。
 * 正常系・スキップ・エラーの各パスを独立したシナリオで網羅し、
 * エクスポート結果カウンタ（exportedCount / skippedCount / errorCount）と
 * outputPaths の正確性を検証する。
 *
 * テストケース:
 * - T-EC-CL-01: セッション1件が有効 → exportedCount=1, skippedCount=0, errorCount=0
 * - T-EC-CL-02: parseSession が null → exportedCount=0, skippedCount=1, errorCount=0
 * - T-EC-CL-03: findSessions が0件 → exportedCount=0, skippedCount=0, errorCount=0
 * - T-EC-CL-04: 3件中2件有効・1件スキップ → exportedCount=2, skippedCount=1, errorCount=0
 * - T-EC-CL-05: config.inputDir が存在しない → exportedCount=0
 * - T-EC-CL-06: writeSession が例外 → exportedCount=0, skippedCount=0, errorCount=1
 * - T-EC-CL-07: 3件中1件成功・1件スキップ・1件エラー → 各カウントが正確
 *
 * @see exportClaude
 */
describe('exportClaude', () => {
  // ─── T-EC-CL-01: 正常にエクスポートされる ───────────────────────────────────

  /**
   * 正常系の基本ケース。
   * セッションファイル1件が parseSession → writeSession の全工程を通過することを検証する。
   * exportedCount=1 かつ outputPaths に書き出し先パスが1件含まれることを確認する。
   */
  describe('Given: セッションファイルが1件あり、parseSession が有効なセッションを返す', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-01: exportedCount=1, skippedCount=0, errorCount=0, outputPaths に1件', async () => {
        const session = _makeSession('session-0001', 'my-app');
        const result = await exportClaude(
          BASE_CONFIG,
          _makeMockProviders({
            findSessions: ['/fake/session.jsonl'],
            parseSession: () => Promise.resolve(session),
          }),
        );
        assertEquals(result.exportedCount, 1);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 0);
        assertEquals(result.outputPaths.length, 1);
        assertEquals(result.outputPaths[0], DEFAULT_OUT_PATH);
      });
    });
  });

  // ─── T-EC-CL-02: parseSession が null → スキップ ───────────────────────────

  /**
   * parseSession が null を返すスキップ仕様の検証。
   * 期間外・内容なしなどの理由でパース結果が null になった場合、
   * skippedCount が正確にカウントされ、writeSession が呼ばれないことを確認する。
   */
  describe('Given: parseSession が null を返す（スキップ対象セッション）', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-02: exportedCount=0, skippedCount=1, errorCount=0, outputPaths=[]', async () => {
        const result = await exportClaude(
          BASE_CONFIG,
          _makeMockProviders({
            findSessions: ['/fake/skipped.jsonl'],
          }),
        );
        assertEquals(result.exportedCount, 0);
        assertEquals(result.skippedCount, 1);
        assertEquals(result.errorCount, 0);
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-CL-03: セッションファイルが0件 ─────────────────────────────────────

  /**
   * 入力ファイルが0件の境界値ケース。
   * findSessions が空配列を返す状況で、全カウンタが0のまま空結果を返すことを検証する。
   * 処理対象なしでも正常終了（例外なし）することを確認する。
   */
  describe('Given: findSessions がファイルを1件も返さない', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-03: exportedCount=0, skippedCount=0, errorCount=0, outputPaths=[]', async () => {
        const result = await exportClaude(BASE_CONFIG, _makeMockProviders());
        assertEquals(result.exportedCount, 0);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 0);
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-CL-04: 複数セッションのカウント ────────────────────────────────────

  /**
   * 複数ファイル混在（有効・スキップ）ケース。
   * 有効2件・スキップ1件が混在する入力に対し、
   * exportedCount と skippedCount が互いに干渉せず独立してカウントされることを検証する。
   */
  describe('Given: セッションファイルが3件あり、2件は有効で1件はスキップ', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-04: exportedCount=2, skippedCount=1, errorCount=0, outputPaths.length=2', async () => {
        const session = _makeSession('session-0001', 'my-app');
        const result = await exportClaude(
          BASE_CONFIG,
          _makeFlowProviders([
            ['/fake/a.jsonl', () => Promise.resolve(session), () => Promise.resolve('/tmp/out.md')],
            ['/fake/b.jsonl', () => Promise.resolve(null), () => Promise.resolve('')],
            ['/fake/c.jsonl', () => Promise.resolve(session), () => Promise.resolve('/tmp/out.md')],
          ]),
        );
        assertEquals(result.exportedCount, 2);
        assertEquals(result.skippedCount, 1);
        assertEquals(result.errorCount, 0);
        assertEquals(result.outputPaths.length, 2);
      });
    });
  });

  // ─── T-EC-CL-05: config.inputDir が findClaudeSessions に渡される ─────────────

  /**
   * inputDir に存在しないディレクトリを渡してデフォルト provider を使うケース。
   * デフォルト provider の findSessions が実ファイルシステムを参照するため、
   * 存在しないパスでは空配列が返り exportedCount=0 になることを確認する。
   */
  describe('Given: config.inputDir に存在しないディレクトリを指定し、findSessions を省略する', () => {
    /** デフォルト provider で `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config) をデフォルト provider で呼び出す', () => {
      it('T-EC-CL-05: inputDir が空ディレクトリなら exportedCount=0, outputPaths=[]', async () => {
        const config = { ...BASE_CONFIG, inputDir: '/nonexistent/custom/projects' };
        const result = await exportClaude(config);
        assertEquals(result.exportedCount, 0);
        assertEquals(result.outputPaths, []);
      });
    });
  });

  // ─── T-EC-CL-06: writeSession が例外 → errorCount=1 ─────────────────────────

  /**
   * writeSession が例外を投げるエラー系ケース。
   * parseSession は成功するが writeSession で失敗する状況を想定する。
   * errorCount に計上され、outputPaths には追加されないことを検証する。
   */
  describe('Given: parseSession が有効なセッションを返し writeSession が例外を投げる', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-06: exportedCount=0, skippedCount=0, errorCount=1', async () => {
        const session = _makeSession('session-0001', 'my-app');
        const result = await exportClaude(
          BASE_CONFIG,
          _makeMockProviders({
            findSessions: ['/fake/session.jsonl'],
            parseSession: () => Promise.resolve(session),
            writeSession: () => Promise.reject(new Error('write failed')),
          }),
        );
        assertEquals(result.exportedCount, 0);
        assertEquals(result.skippedCount, 0);
        assertEquals(result.errorCount, 1);
      });
    });
  });

  // ─── T-EC-CL-07: 3件中 1成功・1スキップ・1エラー ────────────────────────────

  /**
   * 成功・スキップ・エラーが1件ずつ混在する最複合ケース。
   * 3種類のパスが同時に発生したとき、各カウンタが互いに干渉せず
   * それぞれ正確に1になることを検証する。
   */
  describe('Given: セッションファイルが3件あり 1件成功・1件スキップ・1件エラー', () => {
    /** `exportClaude` を呼び出したときの戻り値を検証する。 */
    describe('When: exportClaude(config, providers) を呼び出す', () => {
      it('T-EC-CL-07: exportedCount=1, skippedCount=1, errorCount=1', async () => {
        const session = _makeSession('session-0001', 'my-app');
        const result = await exportClaude(
          BASE_CONFIG,
          _makeFlowProviders([
            ['/fake/a.jsonl', () => Promise.resolve(session), () => Promise.resolve('/tmp/out.md')],
            ['/fake/b.jsonl', () => Promise.resolve(null), () => Promise.resolve('')],
            ['/fake/c.jsonl', () => Promise.reject(new Error('parse failed')), () => Promise.resolve('')],
          ]),
        );
        assertEquals(result.exportedCount, 1);
        assertEquals(result.skippedCount, 1);
        assertEquals(result.errorCount, 1);
      });
    });
  });
});
