// src: skills/_scripts/libs/__tests__/unit/json-utils.unit.spec.ts
// @(#): json-utils ユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { assertNotNull, assertNull } from '../../../../__tests__/helpers/assert.ts';

// -- test target --
import { parseJsonArray } from '../../json-utils.ts';

// ─────────────────────────────────────────────
// parseJsonArray
// ─────────────────────────────────────────────

describe('parseJsonArray', () => {
  describe('Given: 配列直接 \'[{"a":1}]\'', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-01 - [{a:1}] が返る', () => {
        it('T-LIB-J-01: 配列から始まる文字列をパースして返す', () => {
          assertEquals(parseJsonArray('[{"a":1}]'), [{ a: 1 }]);
        });
      });
    });
  });

  describe('Given: 前置テキスト付き \'前置テキスト\\n[{"a":2}]\'', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-02 - [{a:2}] が返る', () => {
        it('T-LIB-J-02: 前置テキストがある場合も non-greedy マッチで配列を返す', () => {
          assertEquals(parseJsonArray('前置テキスト\n[{"a":2}]'), [{ a: 2 }]);
        });
      });
    });
  });

  describe('Given: 前後テキスト付き \'テキスト [{"a":3}] 後置テキスト\'', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-03 - [{a:3}] が返る', () => {
        it('T-LIB-J-03: 前後テキストがある場合も greedy マッチで配列を返す', () => {
          assertEquals(parseJsonArray('テキスト [{"a":3}] 後置テキスト'), [{ a: 3 }]);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-04 - null が返る', () => {
        it('T-LIB-J-04: 空文字列は null を返す', () => {
          assertNull(parseJsonArray(''));
        });
      });
    });
  });

  describe("Given: 配列なしの文字列 'no array here'", () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-05 - null が返る', () => {
        it('T-LIB-J-05: 配列を含まない文字列は null を返す', () => {
          assertNull(parseJsonArray('no array here'));
        });
      });
    });
  });

  describe('Given: 前後テキスト付き複数オブジェクト配列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-06 - 2件の配列が返る', () => {
        it('T-LIB-J-06: greedy マッチで複数オブジェクトを含む配列を返す', () => {
          const result = parseJsonArray('result: [{"a":1},{"a":2}] end');
          assert(Array.isArray(result));
          assertEquals((result as unknown[]).length, 2);
        });
      });
    });
  });

  describe("Given: 空の JSON 配列文字列 '[]'", () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-07 - null が返る', () => {
        it('T-LIB-J-07: 空配列は null を返す（length > 0 条件）', () => {
          assertNull(parseJsonArray('[]'));
        });
      });
    });
  });

  describe('Given: JSON 値内にエスケープ括弧 "[...]" を含む配列文字列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-08 - 外側の配列がパースできる', () => {
        it('[Edge] T-LIB-J-08: JSON 値内に "[...]" が含まれていても外側の配列がパースできる', () => {
          const _raw = '[{"text":"[escaped bracket]","value":1}]';
          const _result = parseJsonArray<{ text: string; value: number }>(_raw);
          assertNotNull(_result);
          assertEquals(_result![0].text, '[escaped bracket]');
          assertEquals(_result![0].value, 1);
        });
      });
    });
  });

  describe('Given: 改行・インデントを含む整形済み JSON 配列文字列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-09 - 2件の配列が返る', () => {
        it('[Normal] T-LIB-J-09: 改行・インデントを含む整形済み JSON 配列がパースできる', () => {
          const _raw = '[\n  {"key": "value1"},\n  {"key": "value2"}\n]';
          const _result = parseJsonArray<{ key: string }>(_raw);
          assertNotNull(_result);
          assertEquals(_result!.length, 2);
          assertEquals(_result![0].key, 'value1');
          assertEquals(_result![1].key, 'value2');
        });
      });
    });
  });

  describe('Given: 前後に説明テキストがある整形済み JSON 配列文字列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-10 - 配列がパースできる', () => {
        it('[Edge] T-LIB-J-10: 前後にテキストがある整形済み JSON 配列がパースできる', () => {
          const _raw = 'Here is the result:\n[\n  {"file":"a.md","decision":"KEEP"}\n]\nDone.';
          const _result = parseJsonArray<{ file: string; decision: string }>(_raw);
          assertNotNull(_result);
          assertEquals(_result![0].file, 'a.md');
        });
      });
    });
  });

  describe('Given: 数値・null・boolean を含む混在配列文字列', () => {
    describe('When: parseJsonArray を実行する', () => {
      describe('Then: T-LIB-J-11 - 4件の混在配列が返る', () => {
        it('[Normal] T-LIB-J-11: 数値・null・boolean を含む配列がパースできる', () => {
          const _raw = '[1, null, true, "str"]';
          const _result = parseJsonArray<unknown>(_raw);
          assertNotNull(_result);
          assertEquals(_result!.length, 4);
          assertEquals(_result![0], 1);
          assertNull(_result![1]);
          assert(_result![2]);
          assertEquals(_result![3], 'str');
        });
      });
    });
  });
});
