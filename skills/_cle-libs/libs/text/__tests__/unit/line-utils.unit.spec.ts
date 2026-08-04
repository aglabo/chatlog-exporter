// src: skills/_cle-libs/libs/__tests__/text/unit/line-utils.unit.spec.ts
// @(#): normalizeLine ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { normalizeLine } from '../../line-utils.ts';

// ─────────────────────────────────────────────
// normalizeLine
// ─────────────────────────────────────────────

describe('normalizeLine', () => {
  describe('Given: CRLF のみの文字列', () => {
    describe('When: normalizeLine を実行する', () => {
      describe('Then: T-LIB-U-07-01 - \\r\\n が \\n に変換される', () => {
        it('T-LIB-U-07-01: CRLF が LF に変換される', () => {
          assertEquals(normalizeLine('line1\r\nline2\r\nline3'), 'line1\nline2\nline3');
        });
      });
    });
  });

  describe('Given: 単独 CR のみの文字列', () => {
    describe('When: normalizeLine を実行する', () => {
      describe('Then: T-LIB-U-07-02 - \\r が \\n に変換される', () => {
        it('T-LIB-U-07-02: 単独 CR が LF に変換される', () => {
          assertEquals(normalizeLine('line1\rline2\rline3'), 'line1\nline2\nline3');
        });
      });
    });
  });

  describe('Given: CRLF・CR・LF が混在する文字列', () => {
    describe('When: normalizeLine を実行する', () => {
      describe('Then: T-LIB-U-07-03 - 全ての行末が \\n に統一される', () => {
        it('T-LIB-U-07-03: CRLF・CR・LF 混在が全て LF に変換される', () => {
          assertEquals(normalizeLine('line1\r\nline2\rline3\nline4'), 'line1\nline2\nline3\nline4');
        });
      });
    });
  });

  describe('Given: LF のみの文字列（変換不要）', () => {
    describe('When: normalizeLine を実行する', () => {
      describe('Then: T-LIB-U-07-04 - 入力と同一の文字列が返る', () => {
        it('T-LIB-U-07-04: LF のみの文字列は変更されない', () => {
          assertEquals(normalizeLine('line1\nline2\nline3'), 'line1\nline2\nline3');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: normalizeLine を実行する', () => {
      describe('Then: T-LIB-U-07-05 - 空文字列が返る', () => {
        it('T-LIB-U-07-05: 空文字列は空文字列のまま返る', () => {
          assertEquals(normalizeLine(''), '');
        });
      });
    });
  });
});
