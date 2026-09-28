// src: skills/normalize-chatlogs/scripts/libs/__tests__/unit/stats-utils.unit.spec.ts
// @(#): stats-utils モジュールのユニットテスト
//       対象: initStats, reportStats
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertMatch, assertNotEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { initStats, reportStats } from '../../stats-utils.ts';

// ─── Helpers
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// types
import type { Stats } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// types

/** `reportStats` が出す警告行の有無・内容を検証する入力 1 組。 */
interface _WarnCase {
  /** テスト ID。 */
  id: string;
  /** 入力の特徴を表すラベル（`it` の説明に埋め込む）。 */
  label: string;
  /** `reportStats` に渡すカウンター。 */
  stats: Stats;
  /** `logger.warn` に出るべき行の全量（順序込み）。 */
  expectedWarnings: string[];
}

// constants

/**
 * `fail` / `error` の警告行が出る／出ない境界を固定する入力の一覧。
 *
 * 件数 1 は「出る側」の最小値、件数 0 は「出ない側」の最大値なので、
 * `> 0` が `> 1` へ厳しくなっても `>= 0` へ緩んでも、いずれかのケースの
 * `warnLogs` 全量比較が食い違う。`fail` と `error` の片方だけが非ゼロの
 * ケースを並べ、もう片方の警告が漏れ出していないことも同時に見る。
 */
const _warnCases: _WarnCase[] = [
  {
    id: 'T-NC-STA-14-06-01',
    label: 'fail=1, error=0（fail の最小の非ゼロ）',
    stats: { success: 0, fail: 1, done: 0, error: 0, skip: 0 },
    expectedWarnings: ['WARNING: 1 file(s) failed'],
  },
  {
    id: 'T-NC-STA-14-07-01',
    label: 'fail=0, error=1（error の最小の非ゼロ）',
    stats: { success: 0, fail: 0, done: 0, error: 1, skip: 0 },
    expectedWarnings: ['WARNING: 1 file(s) errored'],
  },
  {
    id: 'T-NC-STA-14-08-01',
    label: 'fail=0, error=0（成功のみ）',
    stats: { success: 2, fail: 0, done: 1, error: 0, skip: 0 },
    expectedWarnings: [],
  },
  {
    id: 'T-NC-STA-14-09-01',
    label: 'fail=2, error=3（両方が非ゼロ）',
    stats: { success: 0, fail: 2, done: 0, error: 3, skip: 0 },
    expectedWarnings: ['WARNING: 2 file(s) failed', 'WARNING: 3 file(s) errored'],
  },
];

// ─── Tests

/**
 * `initStats` のユニットテストスイート。
 *
 * ゼロ初期化された `Stats` オブジェクトの生成を検証する。
 *
 * テスト ID 範囲: T-SU-01-01
 *
 * @see initStats
 */
describe('initStats', () => {
  describe('When: 正常系', () => {
    it('[Normal] T-SU-01-01: success/fail/done/error/skip すべてが0の Stats を返す', () => {
      assertEquals(initStats(), { success: 0, fail: 0, done: 0, error: 0, skip: 0 });
    });
  });
});

/**
 * `reportStats` のユニットテストスイート。
 *
 * console.log への出力内容を LoggerStub で検証する。
 *
 * テスト ID 範囲: T-NC-STA-14-01-01 〜 T-NC-STA-14-09-01
 *
 * @see reportStats
 */
describe('reportStats', () => {
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
  });

  /** エッジケース: 全カウントが 0 でもスローせず出力する */
  describe('Given: 全カウントが 0 の stats', () => {
    it('[Edge] T-NC-STA-14-02-01: throw せずに stdout に出力される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 0, skip: 0 };

      reportStats(stats);

      assertNotEquals(loggerStub.infoLogs.length, 0);
      assertNotEquals(loggerStub.infoLogs.join(''), '');
    });
  });

  /** 正常系: fail が非ゼロのとき失敗件数を stdout に明示する */
  describe('Given: fail が非ゼロの stats', () => {
    it('[Normal] T-NC-STA-14-03-01: stdout に失敗件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 3, done: 0, error: 0, skip: 0 };

      reportStats(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /fail.*3|3.*fail|失敗.*3|3.*失敗/i);
    });
  });

  /** 正常系: 全5フィールドが出力文字列に含まれる。 */
  describe('Given: 全フィールドが異なる値を持つ stats', () => {
    it('[Normal] T-NC-STA-14-04-01: success/done/skip/fail/error すべてがレポートに含まれる', () => {
      const stats: Stats = { success: 1, fail: 2, done: 3, error: 4, skip: 5 };

      reportStats(stats);

      const output = loggerStub.infoLogs.join('\n');
      assertMatch(output, /success=1/);
      assertMatch(output, /done=3/);
      assertMatch(output, /skip=5/);
      assertMatch(output, /fail=2/);
      assertMatch(output, /error=4/);
    });
  });

  /** エッジケース: error が非ゼロのときエラー件数を stdout に明示する */
  describe('Given: error が非ゼロの stats', () => {
    it('[Edge] T-NC-STA-14-05-01: stdout にエラー件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 2, skip: 0 };

      reportStats(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /error.*2|2.*error/i);
    });
  });

  /**
   * 警告行が出る／出ないの境界テスト。
   *
   * `warnLogs` を部分一致ではなく全量で比較する。部分一致だと「出てはいけない警告が
   * 余分に出ている」側の故障（`> 0` が `>= 0` へ緩む変異）を素通ししてしまう。
   */
  describe('警告行の出力境界', () => {
    for (const { id, label, stats, expectedWarnings } of _warnCases) {
      it(`[Edge] ${id}: ${label} のとき warn に出る行は ${expectedWarnings.length} 件`, () => {
        reportStats(stats);

        assertEquals(loggerStub.warnLogs, expectedWarnings, 'warn に出る行は過不足なく一致する');
      });
    }
  });
});
