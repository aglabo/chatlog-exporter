// src: scripts/testing/mutation/run-deno-test.ts
// @(#): deno test を子プロセスで 1 回実行し、結果を捕捉する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type {
  DenoChildProcess,
  DenoSpawnProvider,
  RunDenoTestOptions,
  TestRunOutcome,
} from './types/mutation.types.ts';

export type {
  DenoChildProcess,
  DenoSpawnProvider,
  RunDenoTestOptions,
  TestRunOutcome,
} from './types/mutation.types.ts';

/** テスト実行で起動するコマンド名。 */
const _DENO_COMMAND = 'deno';

/**
 * 実際のコマンドを、標準出力・標準エラーをパイプにして起動する既定の起動元。
 *
 * @param cmd - 起動するコマンド名
 * @param args - コマンドに渡す起動引数
 * @returns 起動した子プロセス
 */
const _spawnDeno: DenoSpawnProvider = (cmd, args) =>
  new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).spawn();

/**
 * バイト列ストリームを最後まで読み、UTF-8 の文字列にする。
 *
 * @param stream - 読み切るストリーム
 * @returns ストリームの全内容を UTF-8 でデコードした文字列
 */
const _readText = (stream: ReadableStream<Uint8Array>): Promise<string> => new Response(stream).text();

/** 中断信号によって実行を打ち切ったときに返す結果。判定には使わない (execution R-227)。 */
const _ABORTED_OUTCOME: TestRunOutcome = { kind: 'error', message: 'aborted by signal' };

/** 制限時間を超えて実行を打ち切ったときに返す結果 (execution R-218)。 */
const _TIMEOUT_OUTCOME: TestRunOutcome = { kind: 'timeout' };

/**
 * 子プロセスの終了を待ち、終了コードと標準出力・標準エラーを捕捉する。
 * 制限時間を超えたら直接の子プロセスへ `kill` を送り、終了を待ってから `timeout` を返す (execution R-218 / DD-04)。
 * 実行中に `signal` が中止されたら直接の子プロセスへ `kill` を送り、終了を待ってから `error` を返す (execution R-227)。
 * 中断時の結果を `error` とするのは、子プロセスの終了コードが中断によるもので、テストの成否を表さないため
 * (呼び出し側は中断した実行の判定を記録しない)。
 * `kill` が例外を投げたときは、子プロセスが既に自然終了したものとみなして例外を握りつぶし、
 * `timeout` / `error` にせず自然終了の `exited` を返す (execution R-218 / R-219 / DD-04)。
 * タイマーのコールバック内の例外は呼び出し側へ届かず捕捉されない例外になるため、ここで閉じ込める。
 * 打ち切りの理由は `kill` が成功したときだけ、最初の 1 件を記録する。
 * タイマーと中断信号のリスナーは結果が決まった時点で必ず解除する。
 *
 * @param process - 待機する子プロセス
 * @param timeoutMs - 制限時間 (ミリ秒)
 * @param signal - 中断信号 (省略時は中断を受け付けない)
 * @returns 終了コードと出力を保持した `exited` 結果、制限時間を超えたことを示す `timeout` 結果、
 *   または中断されたことを示す `error` 結果
 */
const _awaitProcess = async (
  process: DenoChildProcess,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<TestRunOutcome> => {
  let _stopped: TestRunOutcome | undefined;
  const _stopWith = (outcome: TestRunOutcome) => () => {
    try {
      process.kill();
      _stopped ??= outcome;
    } catch {
      // 子プロセスが既に終了している。自然終了の結果を採る
    }
  };
  const _onAbort = _stopWith(_ABORTED_OUTCOME);
  const _timer = setTimeout(_stopWith(_TIMEOUT_OUTCOME), timeoutMs);
  signal?.addEventListener('abort', _onAbort, { once: true });
  try {
    const [_stdout, _stderr, _status] = await Promise.all([
      _readText(process.stdout),
      _readText(process.stderr),
      process.status,
    ]);
    return _stopped ?? { kind: 'exited', code: _status.code, stdout: _stdout, stderr: _stderr };
  } finally {
    clearTimeout(_timer);
    signal?.removeEventListener('abort', _onAbort);
  }
};

/**
 * `deno` を子プロセスで 1 回実行し、終了コードと標準出力・標準エラーを捕捉する (execution R-217 / REQ-NF-002)。
 * 標準出力と標準エラーは並行に読み切る (片方のパイプが詰まって子プロセスが止まらないように)。
 * 制限時間を超えたら直接の子プロセスを強制終了して `timeout` を返す (execution R-218 / REQ-NF-003)。
 * 実行中に `signal` が中止されたら直接の子プロセスを強制終了して `error` を返す (execution R-227)。
 * 呼び出し前に `signal` が中止済みなら、子プロセスを起動せずに `error` を返す (終了しない子を残さない)。
 * 起動に失敗したときは例外を投げ直さず `error` を返す (execution R-219)。
 *
 * @param args - `deno` に渡す起動引数
 * @param options - 制限時間・中断信号と、子プロセスの起動元 (省略時は実際の `deno`)
 * @returns `exited` 結果、制限時間超過の `timeout` 結果、または起動失敗・中断の原因を保持した `error` 結果
 */
export const runDenoTest = async (args: string[], options: RunDenoTestOptions): Promise<TestRunOutcome> => {
  const { timeoutMs, signal, spawn = _spawnDeno } = options;
  if (signal?.aborted) {
    return _ABORTED_OUTCOME;
  }
  let _process: DenoChildProcess;
  try {
    _process = spawn(_DENO_COMMAND, args);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  return await _awaitProcess(_process, timeoutMs, signal);
};
