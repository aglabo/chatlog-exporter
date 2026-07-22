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
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// types
import type { Stats } from '../../../types/normalize.types.ts';

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
 * テスト ID 範囲: T-14-01-01 〜 T-14-05-01
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
    it('[Edge] T-14-02-01: throw せずに stdout に出力される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 0, skip: 0 };

      reportStats(stats);

      assertNotEquals(loggerStub.infoLogs.length, 0);
      assertNotEquals(loggerStub.infoLogs.join(''), '');
    });
  });

  /** 正常系: fail が非ゼロのとき失敗件数を stdout に明示する */
  describe('Given: fail が非ゼロの stats', () => {
    it('[Normal] T-14-03-01: stdout に失敗件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 3, done: 0, error: 0, skip: 0 };

      reportStats(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /fail.*3|3.*fail|失敗.*3|3.*失敗/i);
    });
  });

  /** 正常系: 全5フィールドが出力文字列に含まれる。 */
  describe('Given: 全フィールドが異なる値を持つ stats', () => {
    it('[Normal] T-14-04-01: success/done/skip/fail/error すべてがレポートに含まれる', () => {
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
    it('[Edge] T-14-05-01: stdout にエラー件数が明示される', () => {
      const stats: Stats = { success: 0, fail: 0, done: 0, error: 2, skip: 0 };

      reportStats(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /error.*2|2.*error/i);
    });
  });
});
