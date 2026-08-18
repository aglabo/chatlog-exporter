// src: scripts/libs/period-filter.ts
// @(#): 期間フィルタユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// error
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// libs
import { isoToLocalDayMs } from '../../../_cle-libs/libs/text/date-utils.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { PeriodRange } from '../types/filter.types.ts';

// ----------
// Functions
// ----------

/**
 * CLI の期間文字列（"YYYY-MM" / undefined）を PeriodRange に変換する。
 *
 * 形式検証に加えて月レンジ（01〜12）も検証し、範囲外の月は
 * `Date` のロールオーバー（例: "2026-13" → 2027年1月）に頼らず Error とする。
 */
export const parsePeriod = (period: string | undefined): PeriodRange => {
  if (!period) {
    return { startMs: 0, endMs: Infinity };
  }
  const ymMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) {
    const year = parseInt(ymMatch[1]);
    const month = parseInt(ymMatch[2]);
    if (month < 1 || month > 12) {
      throw new ChatlogError(
        'InvalidPeriod',
        'InvalidPeriodRange',
        `期間の月が範囲外です（01〜12）: ${period}`,
      );
    }
    const start = new Date(year, month - 1, 1).getTime();
    const end = new Date(year, month, 1).getTime();
    return { startMs: start, endMs: end };
  }
  throw new ChatlogError(
    'InvalidPeriod',
    'InvalidFormat',
    `期間の形式が不正です（例: 2026-03）: ${period}`,
  );
};

/** ISO8601 タイムスタンプが指定した期間範囲内にあるかを判定する。 */
export const inPeriod = (isoTimestamp: string, range: PeriodRange): boolean => {
  const localDayMs = isoToLocalDayMs(isoTimestamp);
  if (localDayMs === null) { return false; }
  return localDayMs >= range.startMs && localDayMs < range.endMs;
};
