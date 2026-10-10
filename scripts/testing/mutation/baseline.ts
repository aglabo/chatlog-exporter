// src: scripts/testing/mutation/baseline.ts
// @(#): 変異体を流す前に元のコードでテストを実行し、続行できるかを判定する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { parseSummary, stripAnsi } from './classify-outcome.ts';
import {
  BASELINE_REASON_LAUNCH_ERROR,
  BASELINE_REASON_NO_SUMMARY,
  BASELINE_REASON_NONZERO_EXIT,
  BASELINE_REASON_TIMEOUT,
  BASELINE_REASON_ZERO_PASSED,
} from './constants/mutation.constants.ts';

import type { BaselineResult, TestRunnerProvider, TestRunOptions, TestRunOutcome } from './types/mutation.types.ts';

/**
 * 終了コード 0 で終わったベースラインの実行から、要約行で判定を導く (execution R-209 / DD-06)。
 * stdout と stderr を改行で連結し、ANSI エスケープを除いた要約行から passed 件数を読む。
 *
 * @param outcome - 終了コード 0 の `exited` のテスト実行結果
 * @returns 要約行が無ければ `failed`、passed が 1 件以上なら `ok`、0 件なら `failed`
 */
const _classifyBySummary = (outcome: Extract<TestRunOutcome, { kind: 'exited' }>): BaselineResult => {
  const _summary = parseSummary(stripAnsi([outcome.stdout, outcome.stderr].join('\n')));
  if (_summary === undefined) {
    return { kind: 'failed', reason: BASELINE_REASON_NO_SUMMARY };
  }
  return _summary.passed >= 1 ? { kind: 'ok' } : { kind: 'failed', reason: BASELINE_REASON_ZERO_PASSED };
};

/**
 * 終了した (`exited`) ベースラインの実行から判定を導く (execution R-208 / R-209 / DD-06)。
 * 終了コードが 0 以外なら、要約行を読む前に `failed` とする。
 *
 * @param outcome - `exited` のテスト実行結果
 * @returns 終了コード 0 かつ passed が 1 件以上なら `ok`、それ以外は `failed`
 */
const _classifyExited = (outcome: Extract<TestRunOutcome, { kind: 'exited' }>): BaselineResult =>
  outcome.code !== 0 ? { kind: 'failed', reason: BASELINE_REASON_NONZERO_EXIT } : _classifyBySummary(outcome);

/**
 * ベースラインのテスト実行結果から、変異体の実行へ進めるかを判定する (execution R-208 / R-209 / DD-10)。
 * 制限時間超過と起動失敗 (`error`) は `failed` とし、起動失敗は runner のメッセージを理由に含める
 * (REQ-F-013 (d))。
 *
 * @param outcome - runner が返したテスト実行結果
 * @returns ベースラインの判定
 */
const _classifyBaseline = (outcome: TestRunOutcome): BaselineResult => {
  switch (outcome.kind) {
    case 'exited':
      return _classifyExited(outcome);
    case 'timeout':
      return { kind: 'failed', reason: BASELINE_REASON_TIMEOUT };
    case 'error':
      return { kind: 'failed', reason: `${BASELINE_REASON_LAUNCH_ERROR}${outcome.message}` };
  }
};

/**
 * runner を 1 回呼び、例外は投げ直さずに起動失敗 (`error`) の結果へ変換する (execution R-208 / DD-10)。
 *
 * @param runner - テストを 1 回実行する provider
 * @param args - `deno` に渡す引数 (変更せずに渡す)
 * @param options - 実行の制限時間と中断信号 (変更せずに渡す)
 * @returns runner が返したテスト実行結果。例外時はそのメッセージを持つ `error`
 */
const _runSafely = async (
  runner: TestRunnerProvider,
  args: string[],
  options: TestRunOptions,
): Promise<TestRunOutcome> => {
  try {
    return await runner(args, options);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * 変異体を流す前に、元のコードのままテストを 1 回実行し、続行できるかを判定する
 * (execution R-208 / R-209 / R-227 / REQ-F-016 / DR-08)。runner の例外は reject せず `failed` とする。
 * 呼び出し前に中断信号が中止済みなら runner を呼ばずに、runner の完了後に中止されていれば
 * 結果を分類せずに、それぞれ `interrupted` とする (execution R-228)。
 *
 * @param runner - テストを 1 回実行する provider
 * @param args - `deno` に渡す引数 (変更せずに渡す)
 * @param options - 実行の制限時間と中断信号 (変更せずに渡す)
 * @returns ベースラインの判定。成功なら `ok`、呼び出し前または実行中に中断されたら `interrupted`
 */
export const runBaseline = async (
  runner: TestRunnerProvider,
  args: string[],
  options: TestRunOptions,
): Promise<BaselineResult> => {
  if (options.signal?.aborted) {
    return { kind: 'interrupted' };
  }
  const _outcome = await _runSafely(runner, args, options);
  return options.signal?.aborted ? { kind: 'interrupted' } : _classifyBaseline(_outcome);
};
