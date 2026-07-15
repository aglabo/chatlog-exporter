// src: scripts/__tests__/unit/aplys-tester.unit.spec.ts
// @(#): aplys-tester のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import {
  buildArgsFromConfig,
  buildBaseGlob,
  buildDenoArgs,
  buildEnvFromConfig,
  parseArgs,
  TesterConfig,
  VALID_MODULES,
  VALID_TYPES,
} from '../../aplys-tester.ts';

// ─────────────────────────────────────────────
// parseArgs
// ─────────────────────────────────────────────

describe('parseArgs', () => {
  // ─── グループ01: テストタイプの正常系 ───────────────────────────────────────

  describe('Given: 有効なテストタイプ "unit" を渡す', () => {
    describe('When: parseArgs(["unit"]) を呼び出す', () => {
      describe('Then: T-AT-PA-01 - testType="unit", moduleName=undefined を返す', () => {
        it('T-AT-PA-01-01: testType が "unit" である', () => {
          const result = parseArgs(['unit']);
          assertEquals(result.testType, 'unit');
        });

        it('T-AT-PA-01-02: moduleName が undefined である', () => {
          const result = parseArgs(['unit']);
          assertEquals(result.moduleName, undefined);
        });
      });
    });
  });

  describe('Given: テストタイプ "all" を渡す', () => {
    describe('When: parseArgs(["all"]) を呼び出す', () => {
      describe('Then: T-AT-PA-02 - testType="all" を返す', () => {
        it('T-AT-PA-02-01: testType が "all" である', () => {
          const result = parseArgs(['all']);
          assertEquals(result.testType, 'all');
        });
      });
    });
  });

  describe('Given: 全ての有効なテストタイプ', () => {
    describe('When: 各タイプで parseArgs を呼び出す', () => {
      describe('Then: T-AT-PA-03 - 各タイプが正しく返る', () => {
        for (const type of VALID_TYPES) {
          it(`T-AT-PA-03: testType="${type}" が正しく返る`, () => {
            const result = parseArgs([type]);
            assertEquals(result.testType, type);
          });
        }
      });
    });
  });

  // ─── グループ02: モジュール名の正常系 ───────────────────────────────────────

  describe('Given: テストタイプ "unit" とモジュール名 "classify" を渡す', () => {
    describe('When: parseArgs(["unit", "classify"]) を呼び出す', () => {
      describe('Then: T-AT-PA-04 - 両フィールドが正しく返る', () => {
        it('T-AT-PA-04-01: testType が "unit" である', () => {
          const result = parseArgs(['unit', 'classify']);
          assertEquals(result.testType, 'unit');
        });

        it('T-AT-PA-04-02: moduleName が "classify" である', () => {
          const result = parseArgs(['unit', 'classify']);
          assertEquals(result.moduleName, 'classify');
        });
      });
    });
  });

  describe('Given: モジュール名として "all" を渡す', () => {
    describe('When: parseArgs(["unit", "all"]) を呼び出す', () => {
      describe('Then: T-AT-PA-05 - moduleName="all" を返す', () => {
        it('T-AT-PA-05-01: moduleName が "all" である', () => {
          const result = parseArgs(['unit', 'all']);
          assertEquals(result.moduleName, 'all');
        });
      });
    });
  });

  describe('Given: 全ての有効なモジュール名', () => {
    describe('When: 各モジュールで parseArgs を呼び出す', () => {
      describe('Then: T-AT-PA-06 - 各モジュール名が正しく返る', () => {
        for (const mod of VALID_MODULES) {
          it(`T-AT-PA-06: moduleName="${mod}" が正しく返る`, () => {
            const result = parseArgs(['unit', mod]);
            assertEquals(result.moduleName, mod);
          });
        }
      });
    });
  });

  // ─── グループ03: エラー系 ────────────────────────────────────────────────────

  describe('Given: 引数なしで呼び出す', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-AT-PA-07 - プロセスが終了する', () => {
        it('T-AT-PA-07-01: Error がスローされる', () => {
          assertThrows(() => parseArgs([]), Error, 'テストタイプを指定してください。');
        });
      });
    });
  });

  describe('Given: 不明なテストタイプ "invalid" を渡す', () => {
    describe('When: parseArgs(["invalid"]) を呼び出す', () => {
      describe('Then: T-AT-PA-08 - プロセスが終了する', () => {
        it('T-AT-PA-08-01: Error がスローされる', () => {
          assertThrows(() => parseArgs(['invalid']), Error, '不明なテストタイプ "invalid"');
        });
      });
    });
  });

  describe('Given: 不明なモジュール名 "unknown-mod" を渡す', () => {
    describe('When: parseArgs(["unit", "unknown-mod"]) を呼び出す', () => {
      describe('Then: T-AT-PA-09 - プロセスが終了する', () => {
        it('T-AT-PA-09-01: Error がスローされる', () => {
          assertThrows(() => parseArgs(['unit', 'unknown-mod']), Error, '不明なモジュール名 "unknown-mod"');
        });
      });
    });
  });

  // ─── グループ04: --use-ai オプション ───────────────────────────────────────

  describe('Given: --use-ai フラグを渡す', () => {
    describe('When: parseArgs(["unit", "--use-ai"]) を呼び出す', () => {
      describe('Then: T-AT-PA-UA-01 - useAi=true を返す', () => {
        it('T-AT-PA-UA-01-01: useAi が true である', () => {
          const result = parseArgs(['unit', '--use-ai']);
          assertEquals(result.useAi, true);
        });
      });
    });
  });

  describe('Given: --use-ai フラグなしで呼び出す', () => {
    describe('When: parseArgs(["unit"]) を呼び出す', () => {
      describe('Then: T-AT-PA-UA-02 - useAi=false を返す', () => {
        it('T-AT-PA-UA-02-01: useAi が false である', () => {
          const result = parseArgs(['unit']);
          assertEquals(result.useAi, false);
        });
      });
    });
  });

  describe('Given: --use-ai フラグが先頭・途中・末尾に位置する', () => {
    describe('When: 各位置で parseArgs を呼び出す', () => {
      describe('Then: T-AT-PA-UA-03 - positional 引数に影響せず useAi=true を返す', () => {
        it('T-AT-PA-UA-03-01: --use-ai が先頭でも testType が "unit" である', () => {
          const result = parseArgs(['--use-ai', 'unit']);
          assertEquals(result.testType, 'unit');
          assertEquals(result.useAi, true);
        });
        it('T-AT-PA-UA-03-02: --use-ai が先頭でも moduleName が "classify" である', () => {
          const result = parseArgs(['--use-ai', 'unit', 'classify']);
          assertEquals(result.moduleName, 'classify');
          assertEquals(result.useAi, true);
        });
        it('T-AT-PA-UA-03-03: --use-ai が途中でも testType が "unit" である', () => {
          const result = parseArgs(['unit', '--use-ai', 'classify']);
          assertEquals(result.testType, 'unit');
          assertEquals(result.useAi, true);
        });
        it('T-AT-PA-UA-03-04: --use-ai が末尾でも moduleName が "classify" である', () => {
          const result = parseArgs(['unit', 'classify', '--use-ai']);
          assertEquals(result.moduleName, 'classify');
          assertEquals(result.useAi, true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// buildBaseGlob
// ─────────────────────────────────────────────

describe('buildBaseGlob', () => {
  // ─── グループ01: moduleName が undefined/all の場合 ──────────────────────────

  describe('Given: moduleName が undefined', () => {
    describe('When: buildBaseGlob(undefined) を呼び出す', () => {
      describe('Then: T-AT-BG-01 - "**/__tests__" を返す', () => {
        it('T-AT-BG-01-01: 戻り値が "**/__tests__" である', () => {
          assertEquals(buildBaseGlob(undefined), '**/__tests__');
        });
      });
    });
  });

  describe('Given: moduleName が "all"', () => {
    describe('When: buildBaseGlob("all") を呼び出す', () => {
      describe('Then: T-AT-BG-02 - "**/__tests__" を返す', () => {
        it('T-AT-BG-02-01: 戻り値が "**/__tests__" である', () => {
          assertEquals(buildBaseGlob('all'), '**/__tests__');
        });
      });
    });
  });

  // ─── グループ02: "libs" の特殊パス ──────────────────────────────────────────

  describe('Given: moduleName が "libs"', () => {
    describe('When: buildBaseGlob("libs") を呼び出す', () => {
      describe('Then: T-AT-BG-03 - libs 用の特殊パスを返す', () => {
        it('T-AT-BG-03-01: 戻り値が "**/_scripts/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('libs'), '**/_scripts/**/__tests__');
        });
      });
    });
  });

  // ─── グループ03: 通常モジュール ──────────────────────────────────────────────

  describe('Given: moduleName が "classify"', () => {
    describe('When: buildBaseGlob("classify") を呼び出す', () => {
      describe('Then: T-AT-BG-04 - モジュール固有のパスを返す', () => {
        it('T-AT-BG-04-01: 戻り値が "**/classify-chatlogs/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('classify'), '**/classify-chatlogs/**/__tests__');
        });
      });
    });
  });

  describe('Given: moduleName が "export"', () => {
    describe('When: buildBaseGlob("export") を呼び出す', () => {
      describe('Then: T-AT-BG-05 - モジュール固有のパスを返す', () => {
        it('T-AT-BG-05-01: 戻り値が "**/export-chatlogs/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('export'), '**/export-chatlogs/**/__tests__');
        });
      });
    });
  });

  describe('Given: moduleName が "set"', () => {
    describe('When: buildBaseGlob("set") を呼び出す', () => {
      describe('Then: T-AT-BG-06 - モジュール固有のパスを返す', () => {
        it('T-AT-BG-06-01: 戻り値が "**/set-frontmatter/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('set'), '**/set-frontmatter/**/__tests__');
        });
      });
    });
  });

  describe('Given: moduleName が "scripts"', () => {
    describe('When: buildBaseGlob("scripts") を呼び出す', () => {
      describe('Then: T-AT-BG-07 - scripts 用の特殊パスを返す', () => {
        it('T-AT-BG-07-01: 戻り値が "scripts/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('scripts'), 'scripts/**/__tests__');
        });
      });
    });
  });

  describe('Given: moduleName が "classes"', () => {
    describe('When: buildBaseGlob("classes") を呼び出す', () => {
      describe('Then: T-AT-BG-08 - classes 用の特殊パスを返す', () => {
        it('T-AT-BG-08-01: 戻り値が "**/_scripts/classes/**/__tests__" である', () => {
          assertEquals(buildBaseGlob('classes'), '**/_scripts/classes/**/__tests__');
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// buildDenoArgs
// ─────────────────────────────────────────────

describe('buildDenoArgs', () => {
  describe('Given: unit タイプのみ', () => {
    describe('When: buildDenoArgs(["unit"], "**/__tests__") を呼び出す', () => {
      describe('Then: T-AT-DA-01 - 基本フラグとパスを含み allow-run を含まない', () => {
        it('T-AT-DA-01-01: --allow-read を含む', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result.includes('--allow-read'), true);
        });
        it('T-AT-DA-01-02: --allow-run を含まない', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result.includes('--allow-run'), false);
        });
        it('T-AT-DA-01-03: --allow-env を含む', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result.includes('--allow-env'), true);
        });
        it('T-AT-DA-01-04: フラットパス "**/__tests__/unit/**/" を含む', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result.includes('**/__tests__/unit/**/'), true);
        });
        it('T-AT-DA-01-05: ネストパス "**/__tests__/*/unit/**/" を含む', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result.includes('**/__tests__/*/unit/**/'), true);
        });
      });
    });
  });

  describe('Given: system タイプのみ', () => {
    describe('When: buildDenoArgs(["system"], "**/__tests__") を呼び出す', () => {
      describe('Then: T-AT-DA-02 - --allow-run と --allow-env を含む', () => {
        it('T-AT-DA-02-01: --allow-run を含む', () => {
          const result = buildDenoArgs(['system'], '**/__tests__');
          assertEquals(result.includes('--allow-run'), true);
        });
        it('T-AT-DA-02-02: --allow-env を含む', () => {
          const result = buildDenoArgs(['system'], '**/__tests__');
          assertEquals(result.includes('--allow-env'), true);
        });
      });
    });
  });

  describe('Given: 全テストタイプ (VALID_TYPES)', () => {
    describe('When: buildDenoArgs([...VALID_TYPES], "**/__tests__") を呼び出す', () => {
      describe('Then: T-AT-DA-03 - 全タイプのパスを含む', () => {
        it('T-AT-DA-03-01: VALID_TYPES の 2 倍のパスを含む（フラット + ネスト各 1 つ）', () => {
          const result = buildDenoArgs([...VALID_TYPES], '**/__tests__');
          const paths = result.filter((a: string) => a.includes('__tests__/'));
          assertEquals(paths.length, VALID_TYPES.length * 2);
        });
      });
    });
  });

  describe('Given: unit タイプ、useAi=true', () => {
    describe('When: buildDenoArgs(["unit"], "**/__tests__", true) を呼び出す', () => {
      describe('Then: T-AT-DA-UA-01 - --allow-env を含む', () => {
        it('T-AT-DA-UA-01-01: --allow-env を含む', () => {
          const result = buildDenoArgs(['unit'], '**/__tests__', true);
          assertEquals(result.includes('--allow-env'), true);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// buildEnvFromConfig
// ─────────────────────────────────────────────

describe('buildEnvFromConfig', () => {
  describe('Given: TesterConfig with useAi=true', () => {
    describe('When: buildEnvFromConfig({ testType: "unit", useAi: true }) を呼び出す', () => {
      describe('Then: T-AT-EV-01 - { RUN_AI: "1" } を返す', () => {
        it('T-AT-EV-01-01: 戻り値が { RUN_AI: "1" } である', () => {
          const result = buildEnvFromConfig({ testType: 'unit', useAi: true });
          assertEquals(result, { RUN_AI: '1' });
        });
      });
    });
  });

  describe('Given: TesterConfig without useAi', () => {
    describe('When: buildEnvFromConfig({ testType: "unit" }) を呼び出す', () => {
      describe('Then: T-AT-EV-02 - {} を返す', () => {
        it('T-AT-EV-02-01: 戻り値が {} である', () => {
          const result = buildEnvFromConfig({ testType: 'unit' });
          assertEquals(result, {});
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// buildArgsFromConfig
// ─────────────────────────────────────────────

describe('buildArgsFromConfig', () => {
  // ─── T-AT-AC-01: testType="unit", moduleName=undefined ──────────────────────

  describe('Given: testType="unit", moduleName=undefined の TesterConfig', () => {
    describe('When: buildArgsFromConfig(config) を呼び出す', () => {
      describe('Then: T-AT-AC-01 - buildDenoArgs(["unit"], "**/__tests__") と同じ結果を返す', () => {
        it('T-AT-AC-01-01: 結果が buildDenoArgs(["unit"], "**/__tests__") と一致する', () => {
          const config: TesterConfig = { testType: 'unit' };
          const result = buildArgsFromConfig(config);
          const expected = buildDenoArgs(['unit'], '**/__tests__');
          assertEquals(result, expected);
        });
      });
    });
  });

  // ─── T-AT-AC-02: testType="all", moduleName=undefined ───────────────────────

  describe('Given: testType="all", moduleName=undefined の TesterConfig', () => {
    describe('When: buildArgsFromConfig(config) を呼び出す', () => {
      describe('Then: T-AT-AC-02 - 全 VALID_TYPES のパスを含む', () => {
        it('T-AT-AC-02-01: VALID_TYPES の 2 倍のパスを含む（フラット + ネスト各 1 つ）', () => {
          const config: TesterConfig = { testType: 'all' };
          const result = buildArgsFromConfig(config);
          const paths = result.filter((a: string) => a.includes('__tests__/'));
          assertEquals(paths.length, VALID_TYPES.length * 2);
        });
      });
    });
  });

  // ─── T-AT-AC-03: testType="unit", moduleName="classify" ─────────────────────

  describe('Given: testType="unit", moduleName="classify" の TesterConfig', () => {
    describe('When: buildArgsFromConfig(config) を呼び出す', () => {
      describe('Then: T-AT-AC-03 - buildDenoArgs(["unit"], "**/classify-chatlogs/**/__tests__") と同じ結果を返す', () => {
        it('T-AT-AC-03-01: 結果が buildDenoArgs(["unit"], "**/classify-chatlogs/**/__tests__") と一致する', () => {
          const config: TesterConfig = { testType: 'unit', moduleName: 'classify' };
          const result = buildArgsFromConfig(config);
          const expected = buildDenoArgs(['unit'], '**/classify-chatlogs/**/__tests__');
          assertEquals(result, expected);
        });
      });
    });
  });
});
