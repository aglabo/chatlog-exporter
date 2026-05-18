#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/unit/normalize-chatlogs.side-effects.unit.spec.ts
// @(#): 副作用のある関数のユニットテスト
//       対象: reportResults (console.log への出力)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertMatch, assertNotEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test helpers
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// test target
import {
  reportResults,
} from '../../normalize-chatlogs.ts';

// types
import type { Stats } from '../../normalize-chatlogs.ts';

// ─── reportResults tests ──────────────────────────────────────────────────────

describe('reportResults', () => {
  let loggerStub: LoggerStub;

  beforeEach(() => {
    loggerStub = makeLoggerStub();
  });

  afterEach(() => {
    loggerStub.restore();
  });

  /** 正常系: success/skip/fail カウントを stdout に集計レポートとして出力する */
  describe('Given: success/skip/fail カウントを持つ stats', () => {
    it('T-14-01-01: stdout に成功件数が含まれる', () => {
      const stats: Stats = { success: 5, skip: 2, fail: 1 };

      reportResults(stats);

      const output = loggerStub.infoLogs.join('\n');
      assertMatch(output, /success.*5|5.*success|成功.*5|5.*成功/i);
    });

    it('T-14-01-02: stdout にスキップ数と失敗数が含まれる', () => {
      const stats: Stats = { success: 3, skip: 1, fail: 2 };

      reportResults(stats);

      const output = loggerStub.infoLogs.join('\n');
      assertMatch(output, /1/);
      assertMatch(output, /2/);
    });
  });

  /** エッジケース: 全カウントが 0 でもスローせず出力する */
  describe('Given: 全カウントが 0 の stats', () => {
    it('T-14-02-01: throw せずに stdout に出力される', () => {
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      reportResults(stats);

      assertNotEquals(loggerStub.infoLogs.length, 0);
      assertNotEquals(loggerStub.infoLogs.join(''), '');
    });
  });

  /** 正常系: fail が非ゼロのとき失敗件数を stdout に明示する */
  describe('Given: fail が非ゼロの stats', () => {
    it('T-14-03-01: stdout に失敗件数が明示される', () => {
      const stats: Stats = { success: 0, skip: 0, fail: 3 };

      reportResults(stats);

      const output = loggerStub.warnLogs.join('\n');
      assertMatch(output, /fail.*3|3.*fail|失敗.*3|3.*失敗/i);
    });
  });
});
