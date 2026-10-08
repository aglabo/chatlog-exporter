// src: scripts/testing/mutation/__tests__/unit/stage-mutant.unit.spec.ts
// @(#): stage-mutant のユニットテスト
//       対象: applyMutant / toMutantPath / toMutationConfigPath / buildMutationConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { applyMutant, buildMutationConfig, toMutantPath, toMutationConfigPath } from '../../stage-mutant.ts';

// ─── Helpers
import { basename, dirname, fromFileUrl } from '@std/path';

import { isMutationArtifact } from '../../resolve-targets.ts';

import type { Mutant } from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 3 行のソース。2 行目 `return n > 0;` の `>` が 10 桁目 (1 始まり) にある。 */
const _SRC3 = 'const x = 1;\nreturn n > 0;\nconst y = 2;\n';

/** リポジトリの元の設定 `deno.jsonc` のパス (本ファイルから 5 階層上)。 */
const _ORIGINAL_CONFIG_PATH = fromFileUrl(new URL('../../../../../deno.jsonc', import.meta.url));

/** 変異させる元ファイルの file URL。 */
const _ORIG_URL = 'file:///repo/a/foo.ts';

/** 変異体ファイルの file URL。 */
const _MUT_URL = 'file:///repo/a/foo.mutation-001.ts';

// helpers
/**
 * `>` を `>=` に置き換える関係演算子の変異体を作る。
 *
 * @param line - 1 始まりの行番号
 * @param column - 1 始まりの桁番号
 * @param lineText - 対象行の元のテキスト
 * @returns `a/foo.ts` を対象とする変異体
 */
function _makeGtMutant(line: number, column: number, lineText: string): Mutant {
  return { file: 'a/foo.ts', line, column, op: 'relational', before: '>', after: '>=', lineText };
}

/**
 * 任意の字句を置き換える変異体を作る。
 *
 * @param line - 1 始まりの行番号
 * @param column - 1 始まりの桁番号
 * @param before - 置換前の字句
 * @param after - 置換後の字句
 * @param lineText - 対象行の元のテキスト
 * @returns `a/foo.ts` を対象とする変異体
 */
function _makeMutant(line: number, column: number, before: string, after: string, lineText: string): Mutant {
  return { file: 'a/foo.ts', line, column, op: 'relational', before, after, lineText };
}

// ─── Tests

/**
 * `applyMutant` のユニットテストスイート。
 *
 * ソース文字列の指定位置 (行・桁) にある字句を変異体の置換後の字句に置き換えることを検証する。
 *
 * テスト ID 範囲: T-MUT-SM-01-01 〜 T-MUT-SM-01-02, T-MUT-SM-06-01 〜 T-MUT-SM-06-03, T-MUT-SM-07-01 〜 T-MUT-SM-07-03,
 *                 T-MUT-SM-10-01, T-MUT-SM-13-01 〜 T-MUT-SM-13-04, T-MUT-SM-14-01 〜 T-MUT-SM-14-02,
 *                 T-MUT-SM-16-01 〜 T-MUT-SM-16-02, T-MUT-SM-18-01, T-MUT-SM-19-01 〜 T-MUT-SM-19-02
 *
 * @see applyMutant
 */
describe('applyMutant', () => {
  /**
   * 指定位置の字句を置き換える (execution R-215 / REQ-F-003)。
   */
  describe('指定位置の字句置換', () => {
    /** 位置と字句が一致する変異体を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-01-01: 2 行目 10 桁目の > を >= に置換 → 2 行目だけが変わり 1・3 行目は元のまま', () => {
        const _result = applyMutant(_SRC3, _makeGtMutant(2, 10, 'return n > 0;'));

        assertEquals(_result, { ok: true, source: 'const x = 1;\nreturn n >= 0;\nconst y = 2;\n' });
      });

      it('[Normal] T-MUT-SM-01-02: 1 行目 5 桁目の ! を空文字に置換 → if (!ok) { が if (ok) { になる', () => {
        const _mutant: Mutant = {
          file: 'a/foo.ts',
          line: 1,
          column: 5,
          op: 'negation',
          before: '!',
          after: '',
          lineText: 'if (!ok) {',
        };

        const _result = applyMutant('if (!ok) {\n  run();\n}\n', _mutant);

        assertEquals(_result, { ok: true, source: 'if (ok) {\n  run();\n}\n' });
      });
    });
  });

  /**
   * 置換前の字句が指定位置に無いときは例外を投げず error 結果を返す (execution R-214 / execution DD-09 / REQ-F-004)。
   */
  describe('置換前の字句が指定位置に無い', () => {
    /** 位置と字句が一致しない変異体を渡す異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-SM-06-01: 10 桁目が < の行に before > の変異体 → 例外を投げず ok: false を返す', () => {
        const _result = applyMutant('return n < 0;\n', _makeGtMutant(1, 10, 'return n < 0;'));

        assertEquals(_result.ok, false);
      });

      // 末尾改行ありの `_SRC3` は split で 4 要素目に '' ができ、line 4 がソース内の空行として扱われる。
      // 行番号が本当にソースの外を指す状況を作るため、末尾改行なしの 3 行を使う。
      it('[Error] T-MUT-SM-06-02: 3 行のソースに line 4 の変異体 → 例外を投げず ok: false を返す', () => {
        const _src3NoTrailingNewline = 'const x = 1;\nreturn n > 0;\nconst y = 2;';

        const _result = applyMutant(_src3NoTrailingNewline, _makeGtMutant(4, 1, ''));

        assertEquals(_result.ok, false);
      });

      it('[Error] T-MUT-SM-06-03: 長さ 10 の行に column 20 の変異体 → 例外を投げず ok: false を返す', () => {
        const _result = applyMutant('let a = 1;\n', _makeGtMutant(1, 20, 'let a = 1;'));

        assertEquals(_result.ok, false);
      });
    });
  });

  /**
   * 変異体を適用しても改行コードを元のまま保つ (execution R-215 / REQ-NF-004 / Edge execution-2)。
   */
  describe('改行コードを保つ', () => {
    /** 改行コードが `\n` 以外のソースを渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-07-01: 全行 \\r\\n の 3 行で 2 行目を変異 → 改行はすべて \\r\\n のまま、変異字句以外は同一', () => {
        const _crlfSrc3 = 'const x = 1;\r\nreturn n > 0;\r\nconst y = 2;\r\n';

        const _result = applyMutant(_crlfSrc3, _makeGtMutant(2, 10, 'return n > 0;'));

        assertEquals(_result, { ok: true, source: 'const x = 1;\r\nreturn n >= 0;\r\nconst y = 2;\r\n' });
      });

      it('[Edge] T-MUT-SM-07-03: \u5168\u884C \\n \u306E 2 \u884C\u3067 2 \u884C\u76EE\u3092\u5909\u7570 \u2192 \u623B\u308A\u5024\u306B \\r \u3092\u542B\u307E\u305A\u3001\u6539\u884C\u306F \\n \u306E\u307E\u307E', () => {
        const _lfSrc2 = 'const x = 1;\nreturn n > 0;\n';

        const _result = applyMutant(_lfSrc2, _makeGtMutant(2, 10, 'return n > 0;'));

        assertEquals(_result.ok && _result.source.includes('\r'), false);
        assertEquals(_result, { ok: true, source: 'const x = 1;\nreturn n >= 0;\n' });
      });
    });
  });

  /**
   * 同じ行に同じ字句が複数あるとき、桁で指定した出現だけを置き換える (execution R-215 / generation Edge-14)。
   */
  describe('同一行に同じ字句が複数ある', () => {
    /** 置換対象の字句が同じ行に 2 回現れるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-10-01: a > b && c > d の 12 桁目 (2 番目の >) を変異 → 2 番目だけが >= になり、3 桁目の > は不変', () => {
        const _result = applyMutant('a > b && c > d\n', _makeGtMutant(1, 12, 'a > b && c > d'));

        assertEquals(_result, { ok: true, source: 'a > b && c >= d\n' });
      });
    });
  });

  /**
   * 行・桁が 1 以上の整数でないときは字句を置き換えず error 結果を返す (execution R-214 / execution DD-09)。
   */
  describe('行・桁が 1 以上の整数でない', () => {
    /** 行・桁に 0・負数・小数を指定した変異体を渡す異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-SM-13-01: a > b の column 0 に before a の変異体 → ok: false を返す', () => {
        const _result = applyMutant('a > b\n', _makeMutant(1, 0, 'a', 'Z', 'a > b'));

        assertEquals(_result.ok, false);
      });

      it('[Error] T-MUT-SM-13-02: a > b の column -1 に before a の変異体 → ok: false を返す', () => {
        const _result = applyMutant('a > b\n', _makeMutant(1, -1, 'a', 'Z', 'a > b'));

        assertEquals(_result.ok, false);
      });

      it('[Error] T-MUT-SM-13-03: a > b の column 1.5 に before a の変異体 → ok: false を返す', () => {
        const _result = applyMutant('a > b\n', _makeMutant(1, 1.5, 'a', 'Z', 'a > b'));

        assertEquals(_result.ok, false);
      });

      it('[Error] T-MUT-SM-13-04: a > b の line 0 column 1 に before a の変異体 → ok: false を返す', () => {
        const _result = applyMutant('a > b\n', _makeMutant(0, 1, 'a', 'Z', 'a > b'));

        assertEquals(_result.ok, false);
      });
    });
  });

  /**
   * 置換前の字句が空文字の変異体は、行末までの位置にだけ挿入できる (execution R-214 / execution R-215)。
   */
  describe('置換前の字句が空文字', () => {
    /** 行の長さを超える桁に空文字の before を指定する異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-SM-14-01: ab の column 4 (行末の先) に before 空文字・after c の変異体 → ok: false を返す', () => {
        const _result = applyMutant('ab\n', _makeMutant(1, 4, '', 'c', 'ab'));

        assertEquals(_result.ok, false);
      });
    });

    /** 行末ちょうどの桁に空文字の before を指定する境界ケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-14-02: ab の column 3 (行末) に before 空文字・after c の変異体 → 行末に挿入した abc を返す', () => {
        const _result = applyMutant('ab\n', _makeMutant(1, 3, '', 'c', 'ab'));

        assertEquals(_result, { ok: true, source: 'abc\n' });
      });
    });
  });

  /**
   * 2 文字以上の字句を、字句の長さ分だけ置き換える (execution R-215 / REQ-F-003)。
   */
  describe('複数文字の字句を置換', () => {
    /** 置換前の字句が 2 文字・3 文字の変異体を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-16-01: a >= b の column 3 の >= を > に置換 → a > b を返す', () => {
        const _result = applyMutant('a >= b', _makeMutant(1, 3, '>=', '>', 'a >= b'));

        assertEquals(_result, { ok: true, source: 'a > b' });
      });

      it('[Normal] T-MUT-SM-16-02: x === y の column 3 の === を !== に置換 → x !== y を返す', () => {
        const _result = applyMutant('x === y', _makeMutant(1, 3, '===', '!==', 'x === y'));

        assertEquals(_result, { ok: true, source: 'x !== y' });
      });
    });
  });

  /**
   * 桁は 1 始まりの UTF-16 コード単位で数え、サロゲートペアの後ろにある字句も置き換える
   * (execution R-215 / Edge generation-24)。
   */
  describe('字句の前にサロゲートペアがある行', () => {
    /** 置換対象の字句より前に U+1F600 (UTF-16 で 2 コード単位) を含む行を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-MUT-SM-18-01: const s = 'U+1F600' > x; の column 16 (UTF-16 単位) の > を >= に置換 → U+1F600 を保って >= になる", () => {
        const _emoji = String.fromCodePoint(0x1f600);
        const _lineText = `const s = '${_emoji}' > x;`;

        const _result = applyMutant(_lineText, _makeMutant(1, 16, '>', '>=', _lineText));

        assertEquals(_result, { ok: true, source: `const s = '${_emoji}' >= x;` });
      });
    });
  });

  /**
   * 数値リテラル全体を 1 字句として置き換える (execution R-215 / Edge generation-16)。
   */
  describe('数値リテラル全体を置き換える', () => {
    /** 置換後の字句が置換前より長い変異体を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-19-01: x = .5; の column 5 の .5 を 1.5 に置換 → 後続の ; を保って x = 1.5; を返す', () => {
        const _result = applyMutant('x = .5;', _makeMutant(1, 5, '.5', '1.5', 'x = .5;'));

        assertEquals(_result, { ok: true, source: 'x = 1.5;' });
      });

      it('[Edge] T-MUT-SM-19-02: x = 0x1F; の column 5 の 0x1F を 0x20 に置換 → 接頭辞付きリテラル全体を 1 字句として置き換えた x = 0x20; を返す', () => {
        const _result = applyMutant('x = 0x1F;', _makeMutant(1, 5, '0x1F', '0x20', 'x = 0x1F;'));

        assertEquals(_result, { ok: true, source: 'x = 0x20;' });
      });
    });
  });
});

/**
 * `toMutantPath` のユニットテストスイート。
 *
 * 変異体ファイルのパスを命名規則 `<stem>.mutation-<NNN>.<ext>` で作ることを検証する (execution DD-01)。
 *
 * テスト ID 範囲: T-MUT-SM-02-01 〜 T-MUT-SM-02-02, T-MUT-SM-05-01, T-MUT-SM-08-01, T-MUT-SM-09-01 〜 T-MUT-SM-09-02,
 *                 T-MUT-SM-15-01
 *
 * @see toMutantPath
 */
describe('toMutantPath', () => {
  /**
   * 変異体ファイルのパスを命名規則で作る (execution R-215 / execution DD-01 / AC-003)。
   */
  describe('変異体ファイルのパスを命名規則で作る', () => {
    /** 元ファイル skills/x/scripts/target.ts から変異体ファイルのパスを作る正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-02-01: 番号 1 → 3 桁にゼロ埋めし、元ファイルと同じディレクトリの target.mutation-001.ts', () => {
        assertEquals(toMutantPath('skills/x/scripts/target.ts', 1), 'skills/x/scripts/target.mutation-001.ts');
      });

      it('[Normal] T-MUT-SM-02-02: 番号 42 → 2 桁の番号も 3 桁にゼロ埋めした foo.mutation-042.ts', () => {
        assertEquals(toMutantPath('a/foo.ts', 42), 'a/foo.mutation-042.ts');
      });
    });
  });

  /**
   * 生成した変異体ファイル名が命名判定と往復一致する (execution DD-01 / generation R-103 / execution R-205)。
   */
  describe('命名判定との往復一致', () => {
    /** 元ファイル a/foo.ts と番号 7 から作った変異体ファイル名を isMutationArtifact に渡すケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-05-01: basename(toMutantPath(a/foo.ts, 7)) → isMutationArtifact が true', () => {
        assertEquals(isMutationArtifact(basename(toMutantPath('a/foo.ts', 7))), true);
      });
    });
  });

  /**
   * `.ts` 以外の拡張子も元ファイルのまま保つ (execution DD-01 / REQ-C-005 / Edge execution-3)。
   */
  describe('.tsx の拡張子を保つ', () => {
    /** 元ファイル a/view.tsx と番号 1 から変異体ファイルのパスを作るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-08-01: a/view.tsx と番号 1 → 拡張子 .tsx を保った a/view.mutation-001.tsx', () => {
        assertEquals(toMutantPath('a/view.tsx', 1), 'a/view.mutation-001.tsx');
      });
    });
  });

  /**
   * 番号が 3 桁の上限に達しても命名規則どおりの桁で作る (execution DD-01 / Edge execution-4)。
   */
  describe('番号の桁あふれ', () => {
    /** 元ファイル a/foo.ts と、3 桁の上限の番号 999 / 上限を超える番号 1000 から変異体ファイルのパスを作るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-09-01: 番号 999 → 3 桁の上限をそのまま使った a/foo.mutation-999.ts', () => {
        assertEquals(toMutantPath('a/foo.ts', 999), 'a/foo.mutation-999.ts');
      });

      it('[Edge] T-MUT-SM-09-02: 番号 1000 → 3 桁で切り詰めず桁をそのまま使った a/foo.mutation-1000.ts', () => {
        assertEquals(toMutantPath('a/foo.ts', 1000), 'a/foo.mutation-1000.ts');
      });
    });
  });

  /**
   * 拡張子の無いパスでも、ファイル名を残したまま番号を付ける (execution DD-01)。
   */
  describe('拡張子の無いパス', () => {
    /** 拡張子を持たない元ファイル a/Makefile と番号 1 から変異体ファイルのパスを作るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-15-01: a/Makefile と番号 1 → ファイル名を保った a/Makefile.mutation-001', () => {
        assertEquals(toMutantPath('a/Makefile', 1), 'a/Makefile.mutation-001');
      });
    });
  });
});

/**
 * `toMutationConfigPath` のユニットテストスイート。
 *
 * 一時設定のパスを命名規則 `deno.mutation-<NNN>.json` で作ることを検証する (execution DD-01)。
 *
 * テスト ID 範囲: T-MUT-SM-03-01, T-MUT-SM-05-02, T-MUT-SM-09-03
 *
 * @see toMutationConfigPath
 */
describe('toMutationConfigPath', () => {
  /**
   * 一時設定のパスを命名規則で作る (execution R-216 / execution DD-01)。
   */
  describe('一時設定のパスを命名規則で作る', () => {
    /** 番号 1 から一時設定のパスを作る正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-03-01: 番号 1 → 元の設定 deno.jsonc と同じディレクトリの deno.mutation-001.json', () => {
        const _result = toMutationConfigPath(1);

        assertEquals(basename(_result), 'deno.mutation-001.json');
        assertEquals(dirname(_result), dirname(_ORIGINAL_CONFIG_PATH));
      });
    });
  });

  /**
   * 生成した一時設定のファイル名が命名判定と往復一致する (execution DD-01 / generation R-103 / execution R-205)。
   */
  describe('命名判定との往復一致', () => {
    /** 番号 7 から作った一時設定のファイル名を isMutationArtifact に渡すケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-05-02: basename(toMutationConfigPath(7)) → isMutationArtifact が true', () => {
        assertEquals(isMutationArtifact(basename(toMutationConfigPath(7))), true);
      });
    });
  });

  /**
   * 番号が 3 桁の上限を超えても一時設定を命名規則どおりの桁で作る (execution DD-01 / Edge execution-4)。
   */
  describe('番号の桁あふれ', () => {
    /** 3 桁の上限を超える番号 1000 から一時設定のパスを作るケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-09-03: 番号 1000 → 3 桁で切り詰めず桁をそのまま使った deno.mutation-1000.json', () => {
        assertEquals(basename(toMutationConfigPath(1000)), 'deno.mutation-1000.json');
      });
    });
  });
});

/**
 * `buildMutationConfig` のユニットテストスイート。
 *
 * 一時設定が元の設定に import の差し替えを 1 件だけ足したものになることを検証する (execution DD-02)。
 *
 * テスト ID 範囲: T-MUT-SM-04-01 〜 T-MUT-SM-04-04, T-MUT-SM-11-01, T-MUT-SM-12-01
 *
 * @see buildMutationConfig
 */
describe('buildMutationConfig', () => {
  /**
   * 一時設定に import の差し替えを 1 件足す (execution R-216 / execution DD-02 / DR-01 / REQ-NF-004)。
   */
  describe('一時設定に import の差し替えを 1 件足す', () => {
    /** imports を持つ元の設定に、元ファイル URL → 変異体 URL を足す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-04-01: imports を持つ設定 → imports に元ファイル URL から変異体 URL への対応が入る', () => {
        const _result = buildMutationConfig({ imports: { '@std/assert': 'jsr:@std/assert@^1' } }, _ORIG_URL, _MUT_URL);

        assertEquals(_result.imports?.[_ORIG_URL], _MUT_URL);
      });

      it('[Normal] T-MUT-SM-04-02: @std/assert と @std/yaml を持つ設定 → 既存の imports を保ち、追加は差し替えの 1 件だけ', () => {
        const _baseImports = { '@std/assert': 'jsr:@std/assert@^1', '@std/yaml': 'jsr:@std/yaml@^1' };

        const _result = buildMutationConfig({ imports: _baseImports }, _ORIG_URL, _MUT_URL);

        assertEquals(_result.imports, { ..._baseImports, [_ORIG_URL]: _MUT_URL });
      });

      it('[Normal] T-MUT-SM-04-03: tasks・compilerOptions・fmt を持つ設定 → imports 以外の 3 キーを元と同じ値で持つ', () => {
        const _otherKeys = { tasks: { test: 'deno test' }, compilerOptions: { strict: true }, fmt: { lineWidth: 120 } };
        const _base = { imports: {}, ..._otherKeys };

        const { tasks, compilerOptions, fmt } = buildMutationConfig(_base, _ORIG_URL, _MUT_URL);

        assertEquals({ tasks, compilerOptions, fmt }, _otherKeys);
      });

      it('[Normal] T-MUT-SM-04-04: imports と tasks を持つ設定 → 呼び出し後も元の設定オブジェクトは呼び出し前のコピーと等しい', () => {
        const _base = { imports: { '@std/assert': 'jsr:@std/assert@^1' }, tasks: { test: 'deno test' } };
        const _snapshot = structuredClone(_base);

        buildMutationConfig(_base, _ORIG_URL, _MUT_URL);

        assertEquals(_base, _snapshot);
      });
    });
  });

  /**
   * 元の設定に imports が無いときは、差し替え 1 件だけの imports を作る (execution R-216 / execution DD-02)。
   */
  describe('元の設定に imports が無い', () => {
    /** tasks だけを持ち imports を持たない元の設定を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-11-01: tasks だけを持つ設定 → tasks を保ち、imports は差し替えの 1 件だけを持つ', () => {
        const _result = buildMutationConfig({ tasks: { test: 'deno test' } }, _ORIG_URL, _MUT_URL);

        assertEquals(_result, { tasks: { test: 'deno test' }, imports: { [_ORIG_URL]: _MUT_URL } });
      });
    });
  });

  /**
   * 元の imports に元ファイルの file URL が既にあっても、変異体の URL で上書きする (execution R-216 / execution DD-02)。
   */
  describe('元の設定に同じキーが既にある', () => {
    /** 元ファイル URL のキーが別の値を持つ元の設定を渡すエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-SM-12-01: 元ファイル URL が other.ts を指す設定 → 当該キーを変異体 URL で上書きし、キー数は元と同じ', () => {
        const _baseImports = { '@std/assert': 'jsr:@std/assert@^1', [_ORIG_URL]: 'file:///repo/a/other.ts' };

        const _result = buildMutationConfig({ imports: _baseImports }, _ORIG_URL, _MUT_URL);

        assertEquals(_result.imports, { '@std/assert': 'jsr:@std/assert@^1', [_ORIG_URL]: _MUT_URL });
      });
    });
  });
});
