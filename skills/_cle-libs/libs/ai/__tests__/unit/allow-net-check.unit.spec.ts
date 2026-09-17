// src: skills/_cle-libs/libs/ai/__tests__/unit/allow-net-check.unit.spec.ts
// @(#): --allow-net 付与範囲の静的検査ヘルパーのユニットテスト
//       対象: extractDenoRunFlags, checkAllowNet
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { checkAllowNet, extractDenoRunFlags } from '../helpers/allow-net-check.ts';
// types
import type { AllowNetExpectation } from '../helpers/allow-net-check.ts';

// ─── Internal Helpers

// types
/** 適合判定テーブルの 1 行。 */
type _ConformingCase = {
  readonly id: string;
  readonly label: string;
  readonly line: string;
  readonly conforming: boolean;
};

/**
 * 付与エイリアス（値付き `--allow-net=<host>` / `-N=<host>`・`-N`・`-A`・`--allow-all`）を `--allow-net` の付与として扱う判定テーブルの 1 行。
 * 期待値は `forbidden` と `required` の両方をとる。期待適合性は expectation から導出する（forbidden → 不適合、required → 適合）。
 * 期待適合性を expectation から導出できない結合短縮フラグのケースは `_CombinedShortFlagCase` を使う。
 */
type _GrantAliasCase = {
  readonly id: string;
  readonly label: string;
  readonly line: string;
  readonly expectation: AllowNetExpectation;
};

/**
 * 結合短縮フラグ（`-` + 英字 2 文字以上、`=<値>` 付きを含む）を含む行の判定テーブルの 1 行。
 * DR-34 により結合短縮フラグは期待値にかかわらず不適合となるため、`expectation` から `conforming` を導出できない。
 * 対照ケース（単独短縮フラグ）も同じテーブルで回すので、両者を独立したフィールドとして持つ。
 */
type _CombinedShortFlagCase = {
  readonly id: string;
  readonly label: string;
  readonly line: string;
  readonly expectation: AllowNetExpectation;
  readonly conforming: boolean;
};

/** 判定対象外テーブルの 1 行。 */
type _ExcludedCase = { readonly id: string; readonly line: string; readonly expectation: AllowNetExpectation };

// constants
/** 非 AI 経路の `deno run` 行が共通して持つ、`--allow-net` 以外のフラグ列の先頭。 */
const _NON_AI_RUN = 'deno run --config ./deno.json --allow-read --allow-write';

/** AI 経路のスクリプト shebang が共通して持つ、`--allow-net` 以外のフラグ列。 */
const _AI_SHEBANG = '#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write --allow-env';

/** 非 AI 経路の行 fixture と、`forbidden` 判定での期待適合性。最終行は `--allow-net` 無しの対照。 */
const _forbiddenCases: readonly _ConformingCase[] = [
  {
    id: 'T-LIB-AI-NET-04-01',
    label: 'export $SCRIPT_PATH に --allow-net',
    line: `${_NON_AI_RUN} --allow-env --allow-net "$SCRIPT_PATH" [agent] [period]`,
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-02',
    label: 'filter $NOISE_FILTER_PATH に --allow-net',
    line: `${_NON_AI_RUN} --allow-net "$NOISE_FILTER_PATH" $REST_ARGS`,
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-03',
    label: 'filter $STRIP_PATH に --allow-net',
    line: `${_NON_AI_RUN} --allow-env --allow-net "$STRIP_PATH" $STRIP_ARGS`,
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-04',
    label: '--allow-net 無しの $NOISE_FILTER_PATH（対照）',
    line: `${_NON_AI_RUN} "$NOISE_FILTER_PATH" $REST_ARGS`,
    conforming: true,
  },
];

/** AI 経路の行 fixture と、`required` 判定での期待適合性。最終行は `--allow-net` 付きの対照。 */
const _requiredCases: readonly _ConformingCase[] = [
  {
    id: 'T-LIB-AI-NET-05-01',
    label: 'SKILL.md 実行行に --allow-net 無し',
    line:
      'deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    conforming: false,
  },
  { id: 'T-LIB-AI-NET-05-02', label: 'shebang に --allow-net 無し', line: _AI_SHEBANG, conforming: false },
  {
    id: 'T-LIB-AI-NET-05-03',
    label: 'test:module に --allow-net 無し',
    line: 'deno run --allow-read --allow-write --allow-run scripts/aplys-tester.ts',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-05-04',
    label: '--allow-net 付きの shebang（対照）',
    line: `${_AI_SHEBANG} --allow-net`,
    conforming: true,
  },
];

/**
 * 付与エイリアス（値付き `--allow-net=<host>` / `-N=<host>`・`-N`・`-A`・`--allow-all`）を含む行 fixture と期待値。
 * 期待適合性は expectation から導出する（forbidden → 不適合、required → 対照として適合）。
 * フラグ集合に `--allow-net` そのものは含まれないため、`_forbiddenCases` / `_requiredCases` とは別に検証する。
 */
const _grantAliasCases: readonly _GrantAliasCase[] = [
  {
    id: 'T-LIB-AI-NET-04-05',
    label: 'filter $NOISE_FILTER_PATH に --allow-net=localhost',
    line: `${_NON_AI_RUN} --allow-net=localhost "$NOISE_FILTER_PATH" $REST_ARGS`,
    expectation: 'forbidden',
  },
  {
    id: 'T-LIB-AI-NET-04-06',
    label: 'filter $STRIP_PATH のフラグ列を -A に置換',
    line: 'deno run -A "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
  },
  {
    id: 'T-LIB-AI-NET-04-07',
    label: 'filter $STRIP_PATH のフラグ列を --allow-all に置換',
    line: 'deno run --allow-all "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
  },
  {
    id: 'T-LIB-AI-NET-04-08',
    label: 'filter $STRIP_PATH のフラグ列を -N に置換',
    line: 'deno run -N "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
  },
  {
    id: 'T-LIB-AI-NET-04-09',
    label: 'filter $NOISE_FILTER_PATH に -N=localhost',
    line: `${_NON_AI_RUN} -N=localhost "$NOISE_FILTER_PATH" $REST_ARGS`,
    expectation: 'forbidden',
  },
  {
    id: 'T-LIB-AI-NET-05-05',
    label: 'SKILL.md 実行行のフラグ列を -A に置換（対照）',
    line: 'deno run --config ./deno.json -A "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
  },
  {
    id: 'T-LIB-AI-NET-05-06',
    label: 'SKILL.md 実行行に --allow-net=localhost（対照）',
    line:
      'deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env --allow-net=localhost "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
  },
  {
    id: 'T-LIB-AI-NET-05-07',
    label: 'SKILL.md 実行行のフラグ列を --allow-all に置換（対照）',
    line: 'deno run --config ./deno.json --allow-all "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
  },
  {
    id: 'T-LIB-AI-NET-05-08',
    label: 'SKILL.md 実行行に -N（対照）',
    line:
      'deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env -N "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
  },
];

/**
 * 結合短縮フラグを含む行 fixture と、期待値・期待適合性の組（DR-34）。
 * 結合短縮フラグを含む行は `required` / `forbidden` のいずれでも不適合とする。最終行は単独短縮フラグ `-R` の対照。
 * `04-10` 〜 `04-13` は `_grantAliasCases` から移動した行で、結合短縮フラグであること自体により不適合となる。
 */
const _combinedShortFlagCases: readonly _CombinedShortFlagCase[] = [
  {
    id: 'T-LIB-AI-NET-04-10',
    label: 'filter $STRIP_PATH のフラグ列を結合短縮フラグ -NR に置換',
    line: 'deno run -NR "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-11',
    label: 'filter $STRIP_PATH のフラグ列を結合短縮フラグ -RN に置換',
    line: 'deno run -RN "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-12',
    label: 'filter $STRIP_PATH のフラグ列を結合短縮フラグ -RA に置換',
    line: 'deno run -RA "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-04-13',
    label: 'filter $STRIP_PATH のフラグ列を値付き結合短縮フラグ -RN=api.x に置換',
    line: 'deno run -RN=api.x "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-01',
    label: 'SKILL.md 実行行のフラグ列を結合短縮フラグ -RN に置換',
    line: 'deno run --config ./deno.json -RN "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-02',
    label: 'SKILL.md 実行行のフラグ列を結合短縮フラグ -RA に置換',
    line: 'deno run --config ./deno.json -RA "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-03',
    label: 'SKILL.md 実行行のフラグ列を値付き結合短縮フラグ -NR=api.x に置換',
    line: 'deno run --config ./deno.json -NR=api.x "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-04',
    label: 'filter $STRIP_PATH のフラグ列を N / A を含まない結合短縮フラグ -RE に置換',
    line: 'deno run -RE "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-06',
    label: 'SKILL.md 実行行に --allow-net と結合短縮フラグ -RE を併記',
    line:
      'deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env --allow-net -RE "$SCRIPT_PATH" [agent] [YYYY-MM] [オプション]',
    expectation: 'required',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-07',
    label: 'filter $STRIP_PATH のフラグ列を英字 3 文字の結合短縮フラグ -ENV に置換',
    line: 'deno run -ENV "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-08',
    label: 'filter $STRIP_PATH のフラグ列を小文字の結合短縮フラグ -rn に置換',
    line: 'deno run -rn "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: false,
  },
  {
    id: 'T-LIB-AI-NET-09-05',
    label: 'filter $STRIP_PATH のフラグ列を単独短縮フラグ -R に置換（対照）',
    line: 'deno run -R "$STRIP_PATH" $STRIP_ARGS',
    expectation: 'forbidden',
    conforming: true,
  },
];

/** `extractDenoRunFlags` が `null` を返すべき、フラグ列を記述しない行。 */
const _nullFlagCases: readonly { readonly id: string; readonly line: string }[] = [
  { id: 'T-LIB-AI-NET-06-01', line: '- 引数なし → deno run ... "$SCRIPT_PATH"' },
];

/** `checkAllowNet` が期待値にかかわらず excluded を返すべき行と期待値の組。 */
const _excludedCases: readonly _ExcludedCase[] = [
  { id: 'T-LIB-AI-NET-06-02', line: 'deno run ... "$SCRIPT_PATH" claude', expectation: 'required' },
  { id: 'T-LIB-AI-NET-06-03', line: 'deno run ... --single-file', expectation: 'forbidden' },
];

/** `extractDenoRunFlags` がフラグ形式（`^-{1,2}[A-Za-z]`）でないトークンと、単独の `-` / `--` 以降のトークンを除いて返すべきフラグ集合。 */
const _flagSetCases: readonly { readonly id: string; readonly line: string; readonly flags: readonly string[] }[] = [
  { id: 'T-LIB-AI-NET-06-04', line: 'deno run --allow-read - < script.ts', flags: ['--allow-read'] },
  { id: 'T-LIB-AI-NET-06-05', line: 'deno run --allow-read -- --allow-net script.ts', flags: ['--allow-read'] },
  { id: 'T-LIB-AI-NET-06-06', line: 'deno run --allow-read - --allow-net < script.ts', flags: ['--allow-read'] },
  { id: 'T-LIB-AI-NET-06-07', line: 'deno run --allow-read -1 script.ts', flags: ['--allow-read'] },
];

// ─── Tests

/**
 * `--allow-net` 付与範囲の静的検査ヘルパーのユニットテストスイート。
 *
 * fixture 文字列を純関数に渡し、フラグ抽出と適合判定を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-NET-04-01 〜 T-LIB-AI-NET-06-07, T-LIB-AI-NET-09-01 〜 T-LIB-AI-NET-09-08
 *
 * @see extractDenoRunFlags
 * @see checkAllowNet
 */
describe('allow-net-check', () => {
  /** `--allow-net` の付与が経路の期待値（AI 経路は必須・非 AI 経路は禁止）に反するケース。 */
  describe('When: 異常系', () => {
    for (const tc of _forbiddenCases) {
      it(`[Error] ${tc.id}: forbidden / ${tc.label} → ${tc.conforming ? '適合' : '不適合'}`, () => {
        const _result = checkAllowNet(tc.line, 'forbidden');
        assert(!_result.excluded, 'excluded になってはならない');
        assertEquals(_result.conforming, tc.conforming);
        assertEquals(_result.flags.has('--allow-net'), !tc.conforming);
      });
    }

    for (const tc of _requiredCases) {
      it(`[Error] ${tc.id}: required / ${tc.label} → ${tc.conforming ? '適合' : '不適合'}`, () => {
        const _result = checkAllowNet(tc.line, 'required');
        assert(!_result.excluded, 'excluded になってはならない');
        assertEquals(_result.conforming, tc.conforming);
        assertEquals(_result.flags.has('--allow-net'), tc.conforming);
      });
    }

    for (const tc of _grantAliasCases) {
      const _conforming = tc.expectation === 'required';
      it(`[Error] ${tc.id}: ${tc.expectation} / ${tc.label} → ${_conforming ? '適合' : '不適合'}`, () => {
        const _result = checkAllowNet(tc.line, tc.expectation);
        assert(!_result.excluded, 'excluded になってはならない');
        assertEquals(_result.conforming, _conforming);
      });
    }

    for (const tc of _combinedShortFlagCases) {
      it(`[Error] ${tc.id}: ${tc.expectation} / ${tc.label} → ${tc.conforming ? '適合' : '不適合'}`, () => {
        const _result = checkAllowNet(tc.line, tc.expectation);
        assert(!_result.excluded, 'excluded になってはならない');
        assertEquals(_result.conforming, tc.conforming);
      });
    }
  });

  /** フラグ列を記述しない例示行を判定対象外とするケースと、フラグ形式でないトークンを除外するケース。 */
  describe('When: エッジケース', () => {
    for (const tc of _nullFlagCases) {
      it(`[Edge] ${tc.id}: extractDenoRunFlags(${tc.line}) → null`, () => {
        assertEquals(extractDenoRunFlags(tc.line), null);
      });
    }

    for (const tc of _excludedCases) {
      it(`[Edge] ${tc.id}: checkAllowNet(${tc.line}, ${tc.expectation}) → excluded`, () => {
        assertEquals(checkAllowNet(tc.line, tc.expectation), { excluded: true });
      });
    }

    for (const tc of _flagSetCases) {
      it(`[Edge] ${tc.id}: extractDenoRunFlags(${tc.line}) → {${tc.flags.join(', ')}}`, () => {
        assertEquals(extractDenoRunFlags(tc.line), new Set(tc.flags));
      });
    }
  });
});
