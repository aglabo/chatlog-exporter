// src: skills/_scripts/libs/__tests__/unit/date-utils.unit.spec.ts
// @(#): date-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../testing/assert.ts';

// -- test target --
import { isoToDate, isoToLocalDayMs, isoToMs } from '../../date-utils.ts';

// ─────────────────────────────────────────────
// isoToLocalDayMs
// ─────────────────────────────────────────────

describe('isoToLocalDayMs', () => {
  describe('Given: 有効な ISO8601 タイムスタンプ', () => {
    describe('When: isoToLocalDayMs を実行する', () => {
      describe('Then: T-LIB-D-01 - number を返す', () => {
        it('T-LIB-D-01-01: 有効な ISO 文字列は number を返し null でない', () => {
          const result = isoToLocalDayMs('2026-04-20T10:30:00Z');
          assertNotNull(result);
          assertEquals(typeof result, 'number');
        });
      });
    });
  });

  describe('Given: isoToDate と同じ ISO 文字列', () => {
    describe('When: isoToLocalDayMs と isoToDate を実行する', () => {
      describe('Then: T-LIB-D-02 - 得られた年月日が isoToDate 結果と整合する', () => {
        it('T-LIB-D-02-01: isoToLocalDayMs の結果から逆算した日付が isoToDate と一致する', () => {
          const iso = '2026-04-20T00:00:00Z';
          const ms = isoToLocalDayMs(iso);
          assertNotNull(ms);
          const d = new Date(ms as number);
          const reconstructed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
            String(d.getDate()).padStart(2, '0')
          }`;
          assertEquals(reconstructed, isoToDate(iso));
        });
      });
    });
  });

  describe('Given: 無効な文字列', () => {
    describe('When: isoToLocalDayMs を実行する', () => {
      describe('Then: T-LIB-D-03 - null を返す', () => {
        it('T-LIB-D-03-01: "invalid" は null を返す', () => {
          assertNull(isoToLocalDayMs('invalid'));
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isoToLocalDayMs を実行する', () => {
      describe('Then: T-LIB-D-04 - null を返す', () => {
        it('T-LIB-D-04-01: 空文字列は null を返す', () => {
          assertNull(isoToLocalDayMs(''));
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// isoToDate
// ─────────────────────────────────────────────

describe('isoToDate', () => {
  describe('Given: 有効な ISO8601 タイムスタンプ', () => {
    describe('When: isoToDate を実行する', () => {
      describe('Then: T-LIB-D-05 - YYYY-MM-DD 形式の文字列を返す', () => {
        it('T-LIB-D-05-01: 有効な ISO 文字列は YYYY-MM-DD 形式を返す', () => {
          const result = isoToDate('2026-04-20T10:30:00Z');
          assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(result), true);
        });
      });
    });
  });

  describe('Given: 月・日が一桁になる日付', () => {
    describe('When: isoToDate を実行する', () => {
      describe('Then: T-LIB-D-06 - 月・日がゼロ埋め 2 桁で返る', () => {
        it('T-LIB-D-06-01: 1 月 5 日は 01-05 となりゼロ埋めされる', () => {
          const result = isoToDate('2026-01-05T00:00:00Z');
          const d = new Date('2026-01-05T00:00:00Z');
          const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
            String(d.getDate()).padStart(2, '0')
          }`;
          assertEquals(result, expected);
        });
      });
    });
  });

  describe('Given: 無効な文字列', () => {
    describe('When: isoToDate を実行する', () => {
      describe('Then: T-LIB-D-07 - "unknown" を返す', () => {
        it('T-LIB-D-07-01: "invalid" は "unknown" を返す', () => {
          assertEquals(isoToDate('invalid'), 'unknown');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isoToDate を実行する', () => {
      describe('Then: T-LIB-D-08 - "unknown" を返す', () => {
        it('T-LIB-D-08-01: 空文字列は "unknown" を返す', () => {
          assertEquals(isoToDate(''), 'unknown');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// isoToMs
// ─────────────────────────────────────────────

describe('isoToMs', () => {
  describe('Given: 有効な ISO8601 タイムスタンプ', () => {
    describe('When: isoToMs を実行する', () => {
      describe('Then: T-LIB-D-09 - new Date(iso).getTime() と等値の number を返す', () => {
        it('T-LIB-D-09-01: 有効な ISO 文字列は正しいエポックミリ秒を返す', () => {
          const iso = '2026-04-20T00:00:00.000Z';
          assertEquals(isoToMs(iso), new Date(iso).getTime());
        });
      });
    });
  });

  describe('Given: 無効な文字列', () => {
    describe('When: isoToMs を実行する', () => {
      describe('Then: T-LIB-D-10 - NaN を返す', () => {
        it('T-LIB-D-10-01: "invalid" は NaN を返す', () => {
          assertEquals(isNaN(isoToMs('invalid')), true);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isoToMs を実行する', () => {
      describe('Then: T-LIB-D-11 - NaN を返す', () => {
        it('T-LIB-D-11-01: 空文字列は NaN を返す', () => {
          assertEquals(isNaN(isoToMs('')), true);
        });
      });
    });
  });
});
