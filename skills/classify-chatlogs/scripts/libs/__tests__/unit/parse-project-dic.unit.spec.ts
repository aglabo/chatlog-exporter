// src: scripts/libs/__tests__/unit/parse-project-dic.unit.spec.ts
// @(#): _parseProjectDic のユニットテスト（YAMLパース結果 → ProjectDicEntry 変換）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
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

          assertEquals('app1' in result, true);
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

          assertEquals('app1' in result, true);
        });

        it('T-CL-PPD-07-02: result に app2 キーが存在する', () => {
          const result = _parseProjectDic({ app1: { def: 'A' }, app2: { def: 'B' } });

          assertEquals('app2' in result, true);
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

          assertEquals('app1' in result, true);
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

          assertEquals('count' in result['app1'], false);
        });

        it('T-CL-PPD-10-03: result["app1"] に "active" キーが存在しない', () => {
          const result = _parseProjectDic({ app1: { def: 'ok', count: 42, active: true } });

          assertEquals('active' in result['app1'], false);
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

          assertEquals('misc' in result, true);
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
});
