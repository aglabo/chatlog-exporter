// src: scripts/libs/__tests__/unit/parse-project-dic.unit.spec.ts
// @(#): _parseProjectDic のユニットテスト（YAMLパース結果 → ProjectDicEntry 変換）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assert, assertEquals, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- Test target --
import { _parseProjectDic } from '../../load-project-dic.ts';

// ─── T-CL-PPD-01: null 入力 → 空オブジェクト ─────────────────────────────────

describe('_parseProjectDic', () => {
  describe('Given: parsed が null', () => {
    describe('When: _parseProjectDic(null) を呼ぶ', () => {
      describe('Then: T-CL-PPD-01 - 空オブジェクトが返る', () => {
        it('T-CL-PPD-01-01: {} が返る', () => {
          assertEquals(_parseProjectDic(null), {});
        });
      });
    });
  });

  // ─── T-CL-PPD-02: undefined → {} ─────────────────────────────────────────────

  describe('Given: parsed が undefined', () => {
    describe('When: _parseProjectDic(undefined) を呼ぶ', () => {
      describe('Then: T-CL-PPD-02 - 空オブジェクトが返る', () => {
        it('T-CL-PPD-02-01: {} が返る', () => {
          assertEquals(_parseProjectDic(undefined), {});
        });
      });
    });
  });

  // ─── T-CL-PPD-03: 配列入力 → {} ──────────────────────────────────────────────

  describe('Given: parsed が配列', () => {
    describe('When: _parseProjectDic([]) を呼ぶ', () => {
      describe('Then: T-CL-PPD-03 - 空オブジェクトが返る', () => {
        it('T-CL-PPD-03-01: {} が返る', () => {
          assertEquals(_parseProjectDic([]), {});
        });
      });
    });
  });

  // ─── T-CL-PPD-04: プリミティブ（文字列）→ {} ─────────────────────────────────

  describe('Given: parsed が文字列', () => {
    describe('When: _parseProjectDic("hello") を呼ぶ', () => {
      describe('Then: T-CL-PPD-04 - 空オブジェクトが返る', () => {
        it('T-CL-PPD-04-01: {} が返る', () => {
          assertEquals(_parseProjectDic('hello'), {});
        });
      });
    });
  });

  // ─── T-CL-PPD-05: 空オブジェクト → {} ───────────────────────────────────────

  describe('Given: parsed が {}', () => {
    describe('When: _parseProjectDic({}) を呼ぶ', () => {
      describe('Then: T-CL-PPD-05 - 空オブジェクトが返る', () => {
        it('T-CL-PPD-05-01: {} が返る', () => {
          assertEquals(_parseProjectDic({}), {});
        });
      });
    });
  });

  // ─── T-CL-PPD-06: 単一プロジェクト → name をキーに props がマッピングされる ──

  describe('Given: { app1: { def: "Test project 1" } }', () => {
    describe('When: _parseProjectDic(input) を呼ぶ', () => {
      describe('Then: T-CL-PPD-06 - app1 キーに def プロパティがマッピングされる', () => {
        it('T-CL-PPD-06-01: result["app1"] が存在する', () => {
          const result = _parseProjectDic({ app1: { def: 'Test project 1' } });

          assert('app1' in result);
        });

        it('T-CL-PPD-06-02: result["app1"]["def"] が "Test project 1"', () => {
          const result = _parseProjectDic({ app1: { def: 'Test project 1' } });

          assertEquals(result['app1']['def'], 'Test project 1');
        });
      });
    });
  });

  // ─── T-CL-PPD-07: 複数プロジェクト → すべてのキーが保持される ───────────────

  describe('Given: { app1: { def: "A" }, app2: { def: "B" } }', () => {
    describe('When: _parseProjectDic(input) を呼ぶ', () => {
      describe('Then: T-CL-PPD-07 - app1/app2 の両キーが含まれる', () => {
        it('T-CL-PPD-07-01: result に app1 キーが存在する', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, app2: { def: 'B' } });

          assert('app1' in result);
        });

        it('T-CL-PPD-07-02: result に app2 キーが存在する', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, app2: { def: 'B' } });

          assert('app2' in result);
        });

        it('T-CL-PPD-07-03: result のキー数が 2 である', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, app2: { def: 'B' } });

          assertEquals(Object.keys(result).length, 2);
        });
      });
    });
  });

  // ─── T-CL-PPD-08: def/category/desc が正しくマッピングされる ─────────────────

  describe('Given: { app1: { def: "Def1", category: "development", desc: "説明" } }', () => {
    describe('When: _parseProjectDic(input) を呼ぶ', () => {
      describe('Then: T-CL-PPD-08 - def/category/desc が result["app1"] にマッピングされる', () => {
        it('T-CL-PPD-08-01: result["app1"]["def"] が "Def1"', () => {
          const result = _parseProjectDic({ app1: { def: 'Def1', category: 'development', desc: '説明' } });

          assertEquals(result['app1']['def'], 'Def1');
        });

        it('T-CL-PPD-08-02: result["app1"]["category"] が "development"', () => {
          const result = _parseProjectDic({ app1: { def: 'Def1', category: 'development', desc: '説明' } });

          assertEquals(result['app1']['category'], 'development');
        });

        it('T-CL-PPD-08-03: result["app1"]["desc"] が "説明"', () => {
          const result = _parseProjectDic({ app1: { def: 'Def1', category: 'development', desc: '説明' } });

          assertEquals(result['app1']['desc'], '説明');
        });
      });
    });
  });

  // ─── T-CL-PPD-09: プロジェクトのメタが null → 空 props のエントリ ────────────

  describe('Given: { app1: null }', () => {
    describe('When: _parseProjectDic({ app1: null }) を呼ぶ', () => {
      describe('Then: T-CL-PPD-09 - app1 キーが存在し、値が空オブジェクト', () => {
        it('T-CL-PPD-09-01: result["app1"] が存在する', () => {
          const result = _parseProjectDic({ app1: null });

          assert('app1' in result);
        });

        it('T-CL-PPD-09-02: result["app1"] が空オブジェクト', () => {
          const result = _parseProjectDic({ app1: null });

          assertEquals(result['app1'], {});
        });
      });
    });
  });

  // ─── T-CL-PPD-10: 非文字列のプロパティ値は除外される ────────────────────────

  describe('Given: { app1: { def: "ok", count: 42, active: true } }', () => {
    describe('When: _parseProjectDic(input) を呼ぶ', () => {
      describe('Then: T-CL-PPD-10 - 文字列以外のプロパティ（count/active）は除外される', () => {
        it('T-CL-PPD-10-01: result["app1"]["def"] が "ok"', () => {
          const result = _parseProjectDic({ app1: { def: 'ok', count: 42, active: true } });

          assertEquals(result['app1']['def'], 'ok');
        });

        it('T-CL-PPD-10-02: result["app1"] に "count" キーが存在しない', () => {
          const result = _parseProjectDic({ app1: { def: 'ok', count: 42, active: true } });

          assertFalse('count' in result['app1']);
        });

        it('T-CL-PPD-10-03: result["app1"] に "active" キーが存在しない', () => {
          const result = _parseProjectDic({ app1: { def: 'ok', count: 42, active: true } });

          assertFalse('active' in result['app1']);
        });
      });
    });
  });

  // ─── T-CL-PPD-11: misc キーも通常プロジェクトと同様にマッピングされる ─────────

  describe('Given: { app1: { def: "A" }, misc: { def: "Misc" } }', () => {
    describe('When: _parseProjectDic(input) を呼ぶ', () => {
      describe('Then: T-CL-PPD-11 - misc も result のキーとして含まれる', () => {
        it('T-CL-PPD-11-01: result に misc キーが存在する', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, misc: { def: 'Misc' } });

          assert('misc' in result);
        });

        it('T-CL-PPD-11-02: result["misc"]["def"] が "Misc"', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, misc: { def: 'Misc' } });

          assertEquals(result['misc']['def'], 'Misc');
        });

        it('T-CL-PPD-11-03: result のキー数が 2 である（misc を含む）', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, misc: { def: 'Misc' } });

          assertEquals(Object.keys(result).length, 2);
        });
      });
    });
  });

  // ─── rules (when / not) の保持 ─────────────────────────────────────────────

  /** rules (when / not) をネストしたまま保持する正常ケース。 */
  describe('When: 正常系', () => {
    const _cases = [
      {
        id: 'T-CL-PPD-12-01',
        label: 'when + not 両方あり → rules を保持し def も文字列のまま',
        input: { app1: { def: 'A', rules: { when: ['w1', 'w2'], not: ['n1'] } } },
        expected: { def: 'A', rules: { when: ['w1', 'w2'], not: ['n1'] } },
      },
      {
        id: 'T-CL-PPD-12-02',
        label: 'when だけ → rules は when キーだけを持つ',
        input: { app1: { def: 'A', rules: { when: ['w1'] } } },
        expected: { def: 'A', rules: { when: ['w1'] } },
      },
      {
        id: 'T-CL-PPD-12-03',
        label: 'not だけ → rules は not キーだけを持つ',
        input: { app1: { def: 'A', rules: { not: ['n1'] } } },
        expected: { def: 'A', rules: { not: ['n1'] } },
      },
    ];

    for (const { id, label, input, expected } of _cases) {
      it(`[Normal] ${id}: ${label}`, () => {
        assertEquals(_parseProjectDic(input)['app1'], expected);
      });
    }
  });

  /** rules がプレーンオブジェクトでない異常ケース。rules キー自体を持たない。 */
  describe('When: 異常系', () => {
    const _cases = [
      {
        id: 'T-CL-PPD-13-01',
        label: 'rules が配列 → rules キーを持たない',
        input: { app1: { def: 'A', rules: ['w1'] } },
        expected: { def: 'A' },
      },
      {
        id: 'T-CL-PPD-13-02',
        label: 'rules が null → rules キーを持たない',
        input: { app1: { def: 'A', rules: null } },
        expected: { def: 'A' },
      },
      {
        id: 'T-CL-PPD-13-03',
        label: 'rules が文字列 → 文字列プロパティとしても残さない',
        input: { app1: { def: 'A', rules: 'w1' } },
        expected: { def: 'A' },
      },
    ];

    for (const { id, label, input, expected } of _cases) {
      it(`[Error] ${id}: ${label}`, () => {
        assertEquals(_parseProjectDic(input)['app1'], expected);
      });
    }

    const _ruleValueCases = [
      {
        id: 'T-CL-PPD-14-01',
        label: 'when が配列でない (文字列) → when キーを持たない',
        input: { app1: { rules: { when: 'w1', not: ['n1'] } } },
        expected: { not: ['n1'] },
      },
      {
        id: 'T-CL-PPD-14-02',
        label: 'not が配列でない (文字列) → not キーを持たない',
        input: { app1: { rules: { when: ['w1'], not: 'n1' } } },
        expected: { when: ['w1'] },
      },
      {
        id: 'T-CL-PPD-14-03',
        label: 'when 配列に非文字列要素 → 文字列要素だけ残る',
        input: { app1: { rules: { when: ['w1', 42, null, 'w2'] } } },
        expected: { when: ['w1', 'w2'] },
      },
      {
        id: 'T-CL-PPD-14-04',
        label: 'not 配列に非文字列要素 → 文字列要素だけ残る',
        input: { app1: { rules: { not: [true, 'n1'] } } },
        expected: { not: ['n1'] },
      },
    ];

    for (const { id, label, input, expected } of _ruleValueCases) {
      it(`[Error] ${id}: ${label}`, () => {
        assertEquals(_parseProjectDic(input)['app1'].rules, expected);
      });
    }
  });

  /** rules の境界値と、rules 以外のプロパティとの共存を扱うケース。 */
  describe('When: エッジケース', () => {
    const _cases = [
      {
        id: 'T-CL-PPD-15-01',
        label: 'rules が空オブジェクト → rules は {} のまま保持する',
        input: { app1: { def: 'A', rules: {} } },
        expected: { def: 'A', rules: {} },
      },
      {
        id: 'T-CL-PPD-15-05',
        label: 'rules と非文字列プロパティ (count: 42) の共存 → count は除外し rules は保持する',
        input: { app1: { def: 'ok', count: 42, rules: { when: ['w1'] } } },
        expected: { def: 'ok', rules: { when: ['w1'] } },
      },
    ];

    for (const { id, label, input, expected } of _cases) {
      it(`[Edge] ${id}: ${label}`, () => {
        assertEquals(_parseProjectDic(input)['app1'], expected);
      });
    }

    const _ruleValueCases = [
      {
        id: 'T-CL-PPD-15-02',
        label: 'when / not が空配列 → 空配列のまま保持する',
        input: { app1: { rules: { when: [], not: [] } } },
        expected: { when: [], not: [] },
      },
      {
        id: 'T-CL-PPD-15-03',
        label: 'when 配列の要素がすべて非文字列 → when は []',
        input: { app1: { rules: { when: [1, 2] } } },
        expected: { when: [] },
      },
      {
        id: 'T-CL-PPD-15-04',
        label: 'rules に when / not 以外のキー → 未知キーは除外する',
        input: { app1: { rules: { when: ['w1'], extra: ['x'] } } },
        expected: { when: ['w1'] },
      },
    ];

    for (const { id, label, input, expected } of _ruleValueCases) {
      it(`[Edge] ${id}: ${label}`, () => {
        assertEquals(_parseProjectDic(input)['app1'].rules, expected);
      });
    }
  });
});
