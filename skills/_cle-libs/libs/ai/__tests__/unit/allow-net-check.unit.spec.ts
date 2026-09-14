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

/** `extractDenoRunFlags` が `null` を返すべき、フラグ列を記述しない行。 */
const _nullFlagCases: readonly { readonly id: string; readonly line: string }[] = [
  { id: 'T-LIB-AI-NET-06-01', line: '- 引数なし → deno run ... "$SCRIPT_PATH"' },
];

/** `checkAllowNet` が期待値にかかわらず excluded を返すべき行と期待値の組。 */
const _excludedCases: readonly _ExcludedCase[] = [
  { id: 'T-LIB-AI-NET-06-02', line: 'deno run ... "$SCRIPT_PATH" claude', expectation: 'required' },
  { id: 'T-LIB-AI-NET-06-03', line: 'deno run ... --single-file', expectation: 'forbidden' },
];

// ─── Tests

/**
 * `--allow-net` 付与範囲の静的検査ヘルパーのユニットテストスイート。
 *
 * fixture 文字列を純関数に渡し、フラグ抽出と適合判定を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-NET-04-01 〜 T-LIB-AI-NET-06-03
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
  });

  /** フラグ列を記述しない例示行を判定対象外とするケース。 */
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
  });
});
