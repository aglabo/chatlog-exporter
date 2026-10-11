// src: scripts/testing/mutation/classify-outcome.ts
// @(#): テスト実行の結果から変異体の判定を導く純粋関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { MutantStatus, TestRunOutcome, TestSummary } from './types/mutation.types.ts';

export type { MutantStatus, TestRunOutcome, TestSummary } from './types/mutation.types.ts';

/** ANSI の CSI エスケープ (`ESC [ ... <終端文字>`)。deno の色付け出力を除くために使う (execution DD-03)。 */
// deno-lint-ignore no-control-regex
const _ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * 文字列から ANSI エスケープ (色付け) を除く (execution DD-03)。
 *
 * @param text - deno の出力など、ANSI エスケープを含みうる文字列
 * @returns ANSI エスケープを除いた文字列
 */
export const stripAnsi = (text: string): string => text.replace(_ANSI_PATTERN, '');

/**
 * deno test の要約行 (`ok | N passed | M failed` / `FAILED | ...`)。
 * 件数の後ろに付く step 件数の注記 (`(k steps)`) は読み飛ばし、テスト件数だけを取り出す (execution DD-06)。
 * `failed` の直後は語境界とし、`failedness` のように語が続く行は要約行とみなさない。
 * 行末アンカーにはしない (`| 2 ignored` などの付加セグメントを保つため)。
 * deno の本物の要約行は常に出力の末尾にあるため、全件を走査できるよう `g` フラグを付ける (Edge execution-31)。
 */
const _SUMMARY_PATTERN = /^(?:ok|FAILED) \| (\d+) passed(?: \(\d+ steps?\))? \| (\d+) failed\b/gm;

/**
 * deno test の要約行からテスト件数を取り出す (execution R-222 / DD-06 / DD-12)。
 * 返すのはテスト件数で、step 件数ではない。
 * deno の本物の要約行は常に末尾にあるため、要約行と同じ形の行が複数あれば最後に一致した行を採る (Edge execution-31)。
 * `failed` の直後は語境界とし、語が続く行は要約行とみなさない。
 *
 * @param text - ANSI エスケープを除いた deno test の出力
 * @returns テスト件数。要約行が無ければ `undefined`
 */
export const parseSummary = (text: string): TestSummary | undefined => {
  const _match = [...text.matchAll(_SUMMARY_PATTERN)].at(-1);
  return _match ? { passed: Number(_match[1]), failed: Number(_match[2]) } : undefined;
};

/**
 * 型検査の失敗を示す deno の表示。各行の行頭にあるときだけ一致させる (execution R-221 / DD-03)。
 * テストの失敗メッセージ中に現れる同じ文言を型検査の失敗と取り違えないための行頭アンカー。
 */
const _TYPE_CHECK_FAILED_PATTERN = /^error: Type checking failed/m;

/**
 * 正常に終了した (`exited`) テスト実行から判定を導く。
 * 評価順は R-220 (終了コード 0 → survived) → R-221 (行頭の型検査失敗 → compile-error)
 * → R-222 (要約行の failed >= 1 → killed) → R-224 (それ以外 → error)。
 *
 * @param outcome - `exited` のテスト実行結果
 * @returns 変異体の判定
 */
const _classifyExited = (outcome: Extract<TestRunOutcome, { kind: 'exited' }>): MutantStatus => {
  if (outcome.code === 0) {
    return 'survived';
  }
  const _text = stripAnsi([outcome.stdout, outcome.stderr].join('\n'));
  if (_TYPE_CHECK_FAILED_PATTERN.test(_text)) {
    return 'compile-error';
  }
  return (parseSummary(_text)?.failed ?? 0) >= 1 ? 'killed' : 'error';
};

/**
 * テスト実行の結果から変異体の判定を導く (execution R-220 〜 R-224 / DR-02)。
 * 結果だけから判定する純粋関数で、`exited` の出力は stdout と stderr を改行で連結し、ANSI エスケープを除いてから調べる。
 *
 * @param outcome - テストを 1 回実行した結果
 * @returns 変異体の判定。`timeout` は timeout (R-223)、起動の失敗 (`error`) は error (R-224)
 */
export const classifyOutcome = (outcome: TestRunOutcome): MutantStatus => {
  switch (outcome.kind) {
    case 'timeout':
      return 'timeout';
    case 'error':
      return 'error';
    case 'exited':
      return _classifyExited(outcome);
  }
};
