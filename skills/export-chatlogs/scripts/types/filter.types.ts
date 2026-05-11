// src: scripts/types/filter.ts
// @(#): 期間フィルタ型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * 期間フィルタリングに使用する半開区間 [startMs, endMs)。
 *
 * `parsePeriod()` が生成し、`inPeriod()` および各パーサー関数
 * （`parseClaudeSession`, `parseCodexSession`）がエントリの
 * タイムスタンプ照合に使用する。
 *
 * 期間指定なしの場合は `{ startMs: 0, endMs: Infinity }` となり、
 * 全エントリが通過する（全期間エクスポート）。
 *
 * @see parsePeriod
 * @see inPeriod
 */
export interface PeriodRange {
  /** フィルタ開始時刻（エポックミリ秒、この値を含む） */
  startMs: number;
  /** フィルタ終了時刻（エポックミリ秒、この値を含まない半開区間） */
  endMs: number;
}
