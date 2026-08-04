// src: skills/_cle-libs/libs/__tests__/text/unit/string-utils.unit.spec.ts
// @(#): string-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import {
  escapeString,
  parseNumber,
  parseString,
  quoteString,
  toStringArrayWithNull,
  toStringWithNull,
} from '../../string-utils.ts';

// ─────────────────────────────────────────────
// toStringWithNull
// ─────────────────────────────────────────────

describe('toStringWithNull', () => {
  describe('Given: null', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe('Then: T-LIB-TU-01 - "" が返る', () => {
        it('T-LIB-TU-01: null は空文字列を返す', () => {
          assertEquals(toStringWithNull(null), '');
        });
      });
    });
  });

  describe('Given: undefined', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe('Then: T-LIB-TU-02 - "" が返る', () => {
        it('T-LIB-TU-02: undefined は空文字列を返す', () => {
          assertEquals(toStringWithNull(undefined), '');
        });
      });
    });
  });

  describe("Given: 文字列 'hello'", () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-03 - 'hello' が返る", () => {
        it('T-LIB-TU-03: 文字列はそのまま返す', () => {
          assertEquals(toStringWithNull('hello'), 'hello');
        });
      });
    });
  });

  describe("Given: 空文字列 ''", () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-04 - '' が返る", () => {
        it('T-LIB-TU-04: 空文字列はそのまま返す', () => {
          assertEquals(toStringWithNull(''), '');
        });
      });
    });
  });

  describe('Given: 数値 42', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-05 - '42' が返る", () => {
        it('T-LIB-TU-05: 数値は文字列に変換して返す', () => {
          assertEquals(toStringWithNull(42), '42');
        });
      });
    });
  });

  describe('Given: 数値 0', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-06 - '0' が返る", () => {
        it("T-LIB-TU-06: 数値 0 は '0' を返す（null 扱いにならない）", () => {
          assertEquals(toStringWithNull(0), '0');
        });
      });
    });
  });

  describe('Given: オブジェクト { a: 1 }', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-07 - '[object Object]' が返る", () => {
        it('T-LIB-TU-07: オブジェクトは String() 変換結果を返す', () => {
          assertEquals(toStringWithNull({ a: 1 }), '[object Object]');
        });
      });
    });
  });

  describe('Given: 真偽値 true', () => {
    describe('When: toStringWithNull を実行する', () => {
      describe("Then: T-LIB-TU-08 - 'true' が返る", () => {
        it("T-LIB-TU-08: true は 'true' を返す", () => {
          assertEquals(toStringWithNull(true), 'true');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// toStringArrayWithNull
// ─────────────────────────────────────────────

describe('toStringArrayWithNull', () => {
  describe("Given: 文字列配列 ['a', 'b']", () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe("Then: T-LIB-TU-09 - ['a', 'b'] が返る", () => {
        it('T-LIB-TU-09: 文字列配列はそのまま返す', () => {
          assertEquals(toStringArrayWithNull(['a', 'b']), ['a', 'b']);
        });
      });
    });
  });

  describe("Given: 数値混在配列 [1, 'two', 3]", () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe("Then: T-LIB-TU-10 - ['1', 'two', '3'] が返る", () => {
        it('T-LIB-TU-10: 数値混在配列は全要素を文字列に変換して返す', () => {
          assertEquals(toStringArrayWithNull([1, 'two', 3]), ['1', 'two', '3']);
        });
      });
    });
  });

  describe('Given: 空配列 []', () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-11 - [] が返る', () => {
        it('T-LIB-TU-11: 空配列はそのまま空配列を返す', () => {
          assertEquals(toStringArrayWithNull([]), []);
        });
      });
    });
  });

  describe('Given: null', () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-12 - [] が返る', () => {
        it('T-LIB-TU-12: null は空配列を返す', () => {
          assertEquals(toStringArrayWithNull(null), []);
        });
      });
    });
  });

  describe('Given: undefined', () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-13 - [] が返る', () => {
        it('T-LIB-TU-13: undefined は空配列を返す', () => {
          assertEquals(toStringArrayWithNull(undefined), []);
        });
      });
    });
  });

  describe("Given: 文字列 'hello'（配列でない）", () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-14 - [] が返る', () => {
        it('T-LIB-TU-14: 文字列は配列でないため空配列を返す', () => {
          assertEquals(toStringArrayWithNull('hello'), []);
        });
      });
    });
  });

  describe('Given: 数値 42（配列でない）', () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-15 - [] が返る', () => {
        it('T-LIB-TU-15: 数値は配列でないため空配列を返す', () => {
          assertEquals(toStringArrayWithNull(42), []);
        });
      });
    });
  });

  describe('Given: オブジェクト { a: 1 }（配列でない）', () => {
    describe('When: toStringArrayWithNull を実行する', () => {
      describe('Then: T-LIB-TU-16 - [] が返る', () => {
        it('T-LIB-TU-16: オブジェクトは配列でないため空配列を返す', () => {
          assertEquals(toStringArrayWithNull({ a: 1 }), []);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// escapeString
// ─────────────────────────────────────────────

describe('escapeString', () => {
  describe('Given: エスケープ対象文字を含まない文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-04 - 入力と同一の文字列が返る', () => {
        it('T-LIB-ES-04: 通常文字列は変更されない', () => {
          assertEquals(escapeString('hello'), 'hello');
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-05 - 空文字列が返る', () => {
        it('T-LIB-ES-05: 空文字列は空文字列のまま返る', () => {
          assertEquals(escapeString(''), '');
        });
      });
    });
  });

  describe('Given: ダブルクォートを含む文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-01 - DQ が \\" にエスケープされる', () => {
        it('T-LIB-ES-01: say "hello" → say \\"hello\\"', () => {
          assertEquals(escapeString('say "hello"'), 'say \\"hello\\"');
        });
      });
    });
  });

  describe('Given: ダブルクォート 1 文字のみ', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-06 - DQ 1 文字が \\" にエスケープされる', () => {
        it('T-LIB-ES-06: " → \\"', () => {
          assertEquals(escapeString('"'), '\\"');
        });
      });
    });
  });

  describe('Given: バックスラッシュを含む文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-02 - BS が \\\\ にエスケープされる', () => {
        it('T-LIB-ES-02: C:\\\\path\\\\to → C:\\\\\\\\path\\\\\\\\to', () => {
          assertEquals(escapeString('C:\\path\\to'), 'C:\\\\path\\\\to');
        });
      });
    });
  });

  describe('Given: バックスラッシュ 1 文字のみ', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-07 - BS 1 文字が \\\\ にエスケープされる', () => {
        it('T-LIB-ES-07: \\ → \\\\', () => {
          assertEquals(escapeString('\\'), '\\\\');
        });
      });
    });
  });

  describe('Given: BS 直後に DQ が続く文字列（順序判別）', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-08 - \\" → \\\\\\"', () => {
        it('T-LIB-ES-08: \\" → \\\\\\"', () => {
          assertEquals(escapeString('\\"'), '\\\\\\"');
        });
      });
    });
  });

  describe('Given: BS と DQ が混在する文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-03 - \\"value\\" → \\\\\\"value\\\\\\"', () => {
        it('T-LIB-ES-03: \\"value\\" → \\\\\\"value\\\\\\"', () => {
          assertEquals(escapeString('\\"value\\"'), '\\\\\\"value\\\\\\"');
        });
      });
    });
  });

  describe('Given: DQ が 2 連続する文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-09 - \\"\\" → \\"\\"', () => {
        it('T-LIB-ES-09: "" → \\"\\"', () => {
          assertEquals(escapeString('""'), '\\"\\"');
        });
      });
    });
  });

  describe('Given: BS が 2 連続する文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-10 - \\\\\\\\ → \\\\\\\\\\\\\\\\', () => {
        it('T-LIB-ES-10: \\\\\\\\ → \\\\\\\\\\\\\\\\', () => {
          assertEquals(escapeString('\\\\'), '\\\\\\\\');
        });
      });
    });
  });

  describe('Given: LF を含む文字列', () => {
    describe('When: escapeString を実行する', () => {
      describe('Then: T-LIB-ES-11 - LF はエスケープされない', () => {
        it('T-LIB-ES-11: a\\nb → a\\nb（LF は変換されない）', () => {
          assertEquals(escapeString('a\nb'), 'a\nb');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// quoteString
// ─────────────────────────────────────────────

describe('quoteString', () => {
  describe('Given: 通常文字列と quote="', () => {
    describe('When: quoteString を実行する', () => {
      describe('Then: T-LIB-ES-20 - " で囲まれた文字列が返る', () => {
        it('T-LIB-ES-20: hello → "hello"', () => {
          assertEquals(quoteString('hello', '"'), '"hello"');
        });
      });
    });
  });

  describe('Given: DQ を含む文字列と quote="', () => {
    describe('When: quoteString を実行する', () => {
      describe('Then: T-LIB-ES-21 - DQ がエスケープされた上で " で囲まれる', () => {
        it('T-LIB-ES-21: say "hi" → "say \\"hi\\""', () => {
          assertEquals(quoteString('say "hi"', '"'), '"say \\"hi\\""');
        });
      });
    });
  });

  describe("Given: 通常文字列と quote='", () => {
    describe('When: quoteString を実行する', () => {
      describe("Then: T-LIB-ES-22 - ' で囲まれた文字列が返る", () => {
        it("T-LIB-ES-22: hello → 'hello'", () => {
          assertEquals(quoteString('hello', "'"), "'hello'");
        });
      });
    });
  });

  describe('Given: 通常文字列と quote=`', () => {
    describe('When: quoteString を実行する', () => {
      describe('Then: T-LIB-ES-23 - ` で囲まれた文字列が返る', () => {
        it('T-LIB-ES-23: hello → `hello`', () => {
          assertEquals(quoteString('hello', '`'), '`hello`');
        });
      });
    });
  });

  describe('Given: 空文字列と quote="', () => {
    describe('When: quoteString を実行する', () => {
      describe('Then: T-LIB-ES-24 - "" が返る', () => {
        it('T-LIB-ES-24: 空文字列 → ""', () => {
          assertEquals(quoteString('', '"'), '""');
        });
      });
    });
  });

  describe('Given: 無効な quote 文字 "x"', () => {
    describe('When: quoteString を実行する', () => {
      describe('Then: T-LIB-ES-25 - Error がスローされる', () => {
        it('T-LIB-ES-25: quote="x" は Error をスローする', () => {
          assertThrows(() => quoteString('hello', 'x'), Error);
        });
      });
    });
  });

  describe('Given: quote を省略した場合', () => {
    describe('When: quoteString を実行する', () => {
      describe("Then: T-LIB-ES-26 - ' で囲まれた文字列が返る", () => {
        it("T-LIB-ES-26: quote 省略時は ' がデフォルト", () => {
          assertEquals(quoteString('hello'), "'hello'");
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// parseString
// ─────────────────────────────────────────────

describe('parseString', () => {
  describe('正常系', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown; expected: string }> = [
      { id: 'T-TXT-PS-03', label: '文字列はそのまま返す', input: 'hello', expected: 'hello' },
    ];
    for (const { id, label, input, expected } of cases) {
      it(`${id}: ${label}`, () => {
        assertEquals(parseString(input), expected);
      });
    }
  });

  describe('エッジケース', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown; expected: string | undefined }> = [
      { id: 'T-TXT-PS-01', label: 'undefined は undefined を返す', input: undefined, expected: undefined },
      { id: 'T-TXT-PS-02', label: 'null は空文字列を返す', input: null, expected: '' },
      { id: 'T-TXT-PS-04', label: '空文字列はそのまま返す', input: '', expected: '' },
    ];
    for (const { id, label, input, expected } of cases) {
      it(`${id}: ${label}`, () => {
        assertEquals(parseString(input), expected);
      });
    }
  });

  describe('異常系', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown }> = [
      { id: 'T-TXT-PS-05', label: '数値は TypeError をスローする', input: 42 },
      { id: 'T-TXT-PS-06', label: 'boolean は TypeError をスローする', input: true },
      { id: 'T-TXT-PS-07', label: 'オブジェクトは TypeError をスローする', input: { a: 1 } },
      { id: 'T-TXT-PS-08', label: '配列は TypeError をスローする', input: [1, 2] },
      { id: 'T-TXT-PS-09', label: '関数は TypeError をスローする', input: () => {} },
    ];
    for (const { id, label, input } of cases) {
      it(`${id}: ${label}`, () => {
        assertThrows(() => parseString(input), TypeError);
      });
    }
  });
});

// ─────────────────────────────────────────────
// parseNumber
// ─────────────────────────────────────────────

describe('parseNumber', () => {
  describe('正常系', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown; expected: number }> = [
      { id: 'T-TXT-PN-01', label: 'number 型の値はそのまま返す', input: 42, expected: 42 },
      { id: 'T-TXT-PN-02', label: '数値文字列は数値に変換して返す', input: '123', expected: 123 },
      {
        id: 'T-TXT-PN-03',
        label: 'アンダースコア区切り数値文字列は数値に変換して返す',
        input: '1_000',
        expected: 1000,
      },
    ];
    for (const { id, label, input, expected } of cases) {
      it(`${id}: ${label}`, () => {
        assertEquals(parseNumber(input), expected);
      });
    }
  });

  describe('エッジケース', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown }> = [
      { id: 'T-TXT-PN-04', label: '空文字列は undefined を返す', input: '' },
      { id: 'T-TXT-PN-05', label: 'undefined は undefined を返す', input: undefined },
      { id: 'T-TXT-PN-06', label: 'null は undefined を返す', input: null },
      { id: 'T-TXT-PN-09', label: 'アンダースコアのみの文字列は undefined を返す', input: '_' },
    ];
    for (const { id, label, input } of cases) {
      it(`${id}: ${label}`, () => {
        assertEquals(parseNumber(input), undefined);
      });
    }
  });

  describe('異常系', () => {
    const cases: ReadonlyArray<{ id: string; label: string; input: unknown }> = [
      { id: 'T-TXT-PN-07', label: '数値変換できない文字列は TypeError をスローする', input: 'abc' },
      { id: 'T-TXT-PN-08', label: 'boolean 型は TypeError をスローする', input: true },
    ];
    for (const { id, label, input } of cases) {
      it(`${id}: ${label}`, () => {
        assertThrows(() => parseNumber(input), TypeError);
      });
    }
  });
});
