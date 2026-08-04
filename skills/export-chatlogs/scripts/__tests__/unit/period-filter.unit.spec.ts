// src: scripts/__tests__/unit/period-filter.unit.spec.ts
// @(#): 期間フィルタ関数のユニットテスト
//       対象: parsePeriod, inPeriod
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { inPeriod, parsePeriod } from '../../libs/period-filter.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';

// ─── Tests

/**
 * `parsePeriod` のユニットテストスイート。
 *
 * CLI の期間文字列を PeriodRange（ミリ秒の半開区間）に変換する関数の動作を検証する。
 * undefined（全期間）・YYYY-MM（月指定）の正常ケースと、
 * 不正形式（YYYY 単独を含む）での Error スローをカバーする。
 *
 * @see parsePeriod
 * @see PeriodRange
 */
describe('parsePeriod', () => {
  /**
   * 期間指定なしのデフォルト全期間シナリオ。
   * undefined を渡すと startMs=0, endMs=Infinity の全件取得範囲が返ることを確認する。
   */
  describe('Given: undefined（期間指定なし）', () => {
    /** parsePeriod(undefined) を呼び出す */
    describe('When: parsePeriod(undefined) を呼び出す', () => {
      /** T-EC-PF-01: 全期間を返す */
      describe('Then: T-EC-PF-01 - 全期間を返す', () => {
        it('T-EC-PF-01-01: startMs=0, endMs=Infinity を返す', () => {
          const range = parsePeriod(undefined);
          assertEquals(range.startMs, 0);
          assertEquals(range.endMs, Infinity);
        });
      });
    });
  });

  /**
   * YYYY-MM 形式の月指定シナリオ。
   * [2026-03-01, 2026-04-01) の半開区間（ローカル時刻基準）が返ることを確認する。
   */
  describe('Given: "2026-03"（年月指定）', () => {
    /** parsePeriod("2026-03") を呼び出す */
    describe('When: parsePeriod("2026-03") を呼び出す', () => {
      /** T-EC-PF-01: 2026年3月の範囲を返す */
      describe('Then: T-EC-PF-01 - 2026年3月の範囲を返す', () => {
        it('T-EC-PF-01-02: startMs が 2026年3月1日のミリ秒', () => {
          const range = parsePeriod('2026-03');
          const expected = new Date(2026, 2, 1).getTime(); // 月は0始まり
          assertEquals(range.startMs, expected);
        });

        it('T-EC-PF-01-03: endMs が 2026年4月1日のミリ秒', () => {
          const range = parsePeriod('2026-03');
          const expected = new Date(2026, 3, 1).getTime();
          assertEquals(range.endMs, expected);
        });
      });
    });
  });

  /**
   * YYYY 形式（年のみ指定、非対応）のシナリオ。
   * YYYY-MM 形式でないため ChatlogError がスローされることを確認する。
   */
  describe('Given: "2026"（年のみ指定、非対応）', () => {
    /** parsePeriod("2026") を呼び出す */
    describe('When: parsePeriod("2026") を呼び出す', () => {
      /** T-EC-PF-01: Error をスローする */
      describe('Then: T-EC-PF-01 - Error をスローする', () => {
        it('T-EC-PF-01-04: ChatlogError がスローされる', () => {
          assertThrows(() => parsePeriod('2026'), ChatlogError);
        });
      });
    });
  });

  /**
   * 不正な形式（YYYY-MM でも YYYY でもない）での Error スローシナリオ。
   * サイレントに undefined を返すのではなく明示的に失敗することを確認する。
   */
  describe('Given: "invalid"（不正な形式）', () => {
    /** parsePeriod("invalid") を呼び出す */
    describe('When: parsePeriod("invalid") を呼び出す', () => {
      /** T-EC-PF-01: Error をスローする */
      describe('Then: T-EC-PF-01 - Error をスローする', () => {
        it('T-EC-PF-01-06: ChatlogError がスローされる', () => {
          assertThrows(() => parsePeriod('invalid'), ChatlogError);
        });

        it('T-EC-PF-01-07: throw された ChatlogError の kind が InvalidPeriod である', () => {
          let err: unknown;
          try {
            parsePeriod('invalid');
          } catch (e) {
            err = e;
          }
          assertEquals((err as ChatlogError).kind, 'InvalidPeriod');
        });

        it('T-EC-PF-01-08: throw された ChatlogError の subindex が "InvalidFormat" になる', () => {
          let err: unknown;
          try {
            parsePeriod('invalid');
          } catch (e) {
            err = e;
          }
          assertEquals((err as ChatlogError).subindex, 'InvalidFormat');
        });
      });
    });
  });
});

// ─── inPeriod ─────────────────────────────────────────────────────────────────

/**
 * `inPeriod` のユニットテストスイート。
 *
 * ISO8601 タイムスタンプが PeriodRange の半開区間 [startMs, endMs) 内にあるかを
 * 判定する関数の動作を検証する。
 * 範囲内・範囲外（前後）・境界値（startMs 含む・endMs 含まない）の各ケースをカバーする。
 *
 * @see inPeriod
 * @see parsePeriod
 */
describe('inPeriod', () => {
  const range = parsePeriod('2026-03'); // 2026-03-01 〜 2026-04-01

  /** 半開区間 [startMs, endMs) の内側にある基本ケース */
  describe('Given: 範囲内のタイムスタンプ "2026-03-15T00:00:00Z"', () => {
    it('T-EC-PF-02-01: true を返す', () => {
      assertEquals(inPeriod('2026-03-15T00:00:00Z', range), true);
    });
  });

  /** startMs - 1ms は区間外になる境界直前ケース */
  describe('Given: startMs の 1ms 前のタイムスタンプ（範囲外）', () => {
    it('T-EC-PF-02-02: false を返す', () => {
      // startMs - 1ms は必ず範囲外（ローカル時刻ベースの境界値テスト）
      const ts = new Date(range.startMs - 1).toISOString();
      assertEquals(inPeriod(ts, range), false);
    });
  });

  /** endMs と等しい 2026-04-01T00:00:00Z は半開区間の外 — false を返す */
  describe('Given: 範囲外（後）のタイムスタンプ "2026-04-01T00:00:00Z"', () => {
    it('T-EC-PF-02-03: false を返す（半開区間）', () => {
      assertEquals(inPeriod('2026-04-01T00:00:00Z', range), false);
    });
  });

  /** startMs と等しい境界値は区間内 [startMs, endMs) の始端を含むケース */
  describe('Given: startMs と等しいタイムスタンプ（2026-03-01T00:00:00 local）', () => {
    it('T-EC-PF-02-04: true を返す（境界値含む）', () => {
      // 月の最初の瞬間は範囲内
      const ts = new Date(range.startMs).toISOString();
      assertEquals(inPeriod(ts, range), true);
    });
  });

  /** endMs と等しい境界値は半開区間の終端で含まれない — false を返すケース */
  describe('Given: endMs と等しいタイムスタンプ（2026-04-01T00:00:00 local）', () => {
    it('T-EC-PF-02-05: false を返す（半開区間、終端は含まない）', () => {
      const ts = new Date(range.endMs).toISOString();
      assertEquals(inPeriod(ts, range), false);
    });
  });
});
