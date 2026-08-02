// src: skills/_scripts/libs/text/date-utils.ts
// @(#): 日付・時刻ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** ISO8601 タイムスタンプをローカル時刻の年・月（0始まり）・日に分解する内部ヘルパー。 */
const _isoToLocalParts = (iso: string): { y: number; m0: number; d: number } | null => {
  const _date = new Date(iso);
  if (isNaN(_date.getTime())) { return null; }
  return { y: _date.getFullYear(), m0: _date.getMonth(), d: _date.getDate() };
};

/**
 * ISO8601 タイムスタンプをローカル日付の 00:00:00 エポックミリ秒に変換する。
 * JST 等のタイムゾーン環境でも UTC タイムスタンプからローカル日付基準で比較できる。
 * パース失敗時は `null` を返す。
 */
export const isoToLocalDayMs = (iso: string): number | null => {
  const p = _isoToLocalParts(iso);
  if (!p) { return null; }
  return new Date(p.y, p.m0, p.d).getTime();
};

/**
 * ISO8601 タイムスタンプ文字列を YYYY-MM-DD 形式の日付文字列（ローカル時刻基準）に変換する。
 * パース失敗時は 'unknown' を返す。
 */
export const isoToDate = (iso: string): string => {
  const p = _isoToLocalParts(iso);
  if (!p) { return 'unknown'; }
  return `${p.y}-${String(p.m0 + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/**
 * ISO8601 タイムスタンプ文字列をエポックミリ秒に変換する。
 * パース失敗時は 0 を返す。
 */
export const isoToMs = (iso: string): number => {
  try {
    return new Date(iso).getTime();
  } catch {
    return 0;
  }
};
