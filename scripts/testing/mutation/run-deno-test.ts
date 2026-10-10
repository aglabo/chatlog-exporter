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
  TestRunnerProvider,
  TestRunOptions,
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
 * 打ち切り (制限時間の超過・中断) を試みたあと、子プロセスの終了から標準出力・標準エラーの終端を待つ猶予 (ミリ秒)。
 * `kill` が例外を投げた (子プロセスが既に自然終了していた) 場合も同じ猶予を置く。
 * 孫プロセスがパイプを保持し続けると出力は閉じないため、猶予を過ぎたら読み取りを打ち切る (execution R-218 / R-227 / DD-04)。
 */
const _STREAM_GRACE_MS = 1000;

/**
 * バイト列ストリームを最後まで読み、UTF-8 の文字列にする。
 * `signal` が中止されたら読み取りを打ち切ってストリームを cancel し、それまでに読めた分を返す (reject しない)。
 * 中止の前にストリームが失敗したときは、その原因で reject する。
 * チャンクの境界で分かれたマルチバイト文字は、ストリームデコードでつなげて復元する。
 *
 * @param stream - 読み切るストリーム
 * @param signal - 読み取りの打ち切り信号
 * @returns ストリームの全内容 (打ち切り時は読めた分) を UTF-8 でデコードした文字列
 */
const _readText = async (stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<string> => {
  const _reader = stream.getReader();
  const _decoder = new TextDecoder();
  const _cancel = () => void _reader.cancel().catch(() => {/* 失敗済みのストリームは cancel できない */});
  signal.addEventListener('abort', _cancel, { once: true });
  if (signal.aborted) {
    _cancel();
  }
  const _chunks: string[] = [];
  try {
    for (let _read = await _reader.read(); !_read.done; _read = await _reader.read()) {
      _chunks.push(_decoder.decode(_read.value, { stream: true }));
    }
    return _chunks.join('') + _decoder.decode();
  } finally {
    signal.removeEventListener('abort', _cancel);
    _reader.releaseLock();
  }
};

/** 中断信号によって実行を打ち切ったときに返す結果。判定には使わない (execution R-227)。 */
const _ABORTED_OUTCOME: TestRunOutcome = { kind: 'error', message: 'aborted by signal' };

/** 制限時間を超えて実行を打ち切ったときに返す結果 (execution R-218)。 */
const _TIMEOUT_OUTCOME: TestRunOutcome = { kind: 'timeout' };

/**
 * 子プロセスへ `SIGKILL` を送り、例外は握りつぶす。
 *
 * @param process - 強制終了する子プロセス
 * @returns `SIGKILL` を送れたら `true`、`kill` が例外を投げた (子プロセスが既に終了している) なら `false`
 */
const _killQuietly = (process: DenoChildProcess): boolean => {
  try {
    process.kill('SIGKILL');
    return true;
  } catch {
    return false;
  }
};

/**
 * 子プロセスの終了 (`status`) を待ってから、出力の終端を待つ猶予タイマーを 1 回だけ起動する仕組みを作る。
 * 猶予を過ぎたら `reading` を中止し、出力の読み取りを打ち切る。
 * 終了待ちの失敗は呼び出し側 (`Promise.all`) が扱うため、ここでは握りつぶす。
 * 結果が決まったあと (`dispose` 後) には起動しない。
 *
 * @param process - 終了を待つ子プロセス
 * @param reading - 出力の読み取りを打ち切る中止コントローラ
 * @returns 猶予タイマーを起動する `arm` と、起動済みのタイマーを解除して以後の起動を止める `dispose`
 */
const _makeStreamGrace = (process: DenoChildProcess, reading: AbortController) => {
  let _armed = false;
  let _disposed = false;
  let _timer: number | undefined;
  const _start = () => {
    if (!_disposed) {
      _timer = setTimeout(() => reading.abort(), _STREAM_GRACE_MS);
    }
  };
  return {
    arm: () => {
      if (!_armed) {
        _armed = true;
        process.status.then(_start, () => {/* 終了待ちの失敗は呼び出し側で扱う */});
      }
    },
    dispose: () => {
      _disposed = true;
      clearTimeout(_timer);
    },
  };
};

/**
 * 子プロセスの終了 (`status` の決着) か `_STREAM_GRACE_MS` の経過の、早い方まで待つ。
 * `status` の reject は決着として扱い、ここで握りつぶす (捕捉されない reject にしない)。
 * 待機用のタイマーは、どちらで抜けても必ず解除する。
 *
 * @param process - 終了を待つ子プロセス
 * @returns `status` が決着するか猶予が過ぎたら解決する Promise (reject しない)
 */
const _waitExitOrGrace = async (process: DenoChildProcess): Promise<void> => {
  let _timer: number | undefined;
  const _elapsed = new Promise<void>((resolve) => {
    _timer = setTimeout(resolve, _STREAM_GRACE_MS);
  });
  try {
    await Promise.race([process.status.then(() => {}, () => {/* 終了待ちの失敗も決着として扱う */}), _elapsed]);
  } finally {
    clearTimeout(_timer);
  }
};

/**
 * 子プロセスの終了を待ち、終了コードと標準出力・標準エラーを捕捉する。
 * 標準出力・標準エラー・終了待ちは並行に待つ (片方のパイプが詰まって子プロセスが止まらないように)。
 * 制限時間を超えたら直接の子プロセスへ `SIGKILL` を送り、`timeout` を返す (execution R-218 / DD-04)。
 * 実行中に `signal` が中止されたら直接の子プロセスへ `SIGKILL` を送り、`error` を返す (execution R-227)。
 * 中断時の結果を `error` とするのは、子プロセスの終了コードが中断によるもので、テストの成否を表さないため
 * (呼び出し側は中断した実行の判定を記録しない)。
 * 打ち切りの理由は `kill` が成功したときだけ、最初の 1 件を記録する。
 * `kill` が例外を投げたときは、子プロセスが既に自然終了したものとみなし、`timeout` / `error` にせず
 * 自然終了の `exited` を返す (execution R-218 / R-219 / DD-04)。
 * どちらの場合も、子プロセスの終了 (`status`) 後に `_STREAM_GRACE_MS` だけ出力の終端を待つ。
 * 孫プロセスがパイプを保持して出力が閉じなければ、読み取りを打ち切ってストリームを cancel する。
 * 打ち切った読み取りはそれまでに読めた分で決着するため、`kill` が例外を投げた場合の `exited` は
 * 打ち切りまでに読めた出力と `status` の終了コードを持つ。
 * タイマーのコールバック内の例外は呼び出し側へ届かず捕捉されない例外になるため、ここで閉じ込める。
 * 停止 (制限時間の超過・中断による `kill`) は 1 回限りとする。最初の停止で以後の停止を無効にし、
 * 中断後の猶予中に制限時間が来ても `SIGKILL` を再送しない。`kill` が例外を投げた (自然終了済みの) 場合も、以後の停止は行わない。
 * 停止して `kill` が成功したあとに読み取り・終了待ちが失敗しても、打ち切りの結果
 * (`timeout` / `aborted by signal` の `error`) を維持する。打ち切りの理由は `kill` が成功した時点で確定しており、
 * `SIGKILL` のあとの失敗は強制終了に伴うもので、結果を変えないため。
 * 打ち切っていないのに読み取り・終了待ちが失敗したときは、以後の停止を無効にしてから子プロセスへ `SIGKILL` を 1 回送り、
 * `status` の決着 (解決・reject のどちらでも) か `_STREAM_GRACE_MS` の経過の早い方まで待ってから、
 * 原因のメッセージを持つ `error` を返す (execution R-219)。子プロセスの終了を見届けずに結果を返さないため。
 * タイマー・猶予タイマー・中断信号のリスナーは結果が決まった時点で必ず解除し、未完了の読み取りは打ち切る。
 *
 * @param process - 待機する子プロセス
 * @param timeoutMs - 制限時間 (ミリ秒)
 * @param signal - 中断信号 (省略時は中断を受け付けない)
 * @returns 終了コードと出力を保持した `exited` 結果、制限時間を超えたことを示す `timeout` 結果、
 *   または中断・失敗の原因を保持した `error` 結果
 */
const _awaitProcess = async (
  process: DenoChildProcess,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<TestRunOutcome> => {
  const _reading = new AbortController();
  const _grace = _makeStreamGrace(process, _reading);
  let _halted = false;
  let _stopped: TestRunOutcome | undefined;
  const _stopWith = (outcome: TestRunOutcome) => () => {
    if (_halted) {
      return;
    }
    _halted = true;
    if (_killQuietly(process)) {
      _stopped = outcome;
    }
    _grace.arm();
  };
  const _onAbort = _stopWith(_ABORTED_OUTCOME);
  const _timer = setTimeout(_stopWith(_TIMEOUT_OUTCOME), timeoutMs);
  signal?.addEventListener('abort', _onAbort, { once: true });
  try {
    const [_stdout, _stderr, _status] = await Promise.all([
      _readText(process.stdout, _reading.signal),
      _readText(process.stderr, _reading.signal),
      process.status,
    ]);
    return _stopped ?? { kind: 'exited', code: _status.code, stdout: _stdout, stderr: _stderr };
  } catch (e) {
    if (_stopped !== undefined) {
      return _stopped;
    }
    _halted = true;
    _killQuietly(process);
    await _waitExitOrGrace(process);
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(_timer);
    _grace.dispose();
    signal?.removeEventListener('abort', _onAbort);
    _reading.abort();
  }
};

/**
 * `deno` を子プロセスで 1 回実行し、終了コードと標準出力・標準エラーを捕捉する (execution R-217 / REQ-NF-002)。
 * 標準出力と標準エラーは並行に読み切る (片方のパイプが詰まって子プロセスが止まらないように)。
 * 制限時間を超えたら直接の子プロセスを `SIGKILL` で強制終了して `timeout` を返す (execution R-218 / REQ-NF-003)。
 * 実行中に `signal` が中止されたら直接の子プロセスを `SIGKILL` で強制終了して `error` を返す (execution R-227)。
 * 打ち切り後に出力が閉じなければ、猶予 (`_STREAM_GRACE_MS`) の後に読み取りを打ち切って結果を返す。
 * 子プロセスが既に自然終了していて `kill` が例外を投げたときも同じ猶予を置き、打ち切りまでに読めた出力で `exited` を返す。
 * 強制終了 (停止) は 1 回限りで、中断後の猶予中に制限時間が来ても `SIGKILL` を再送しない。
 * 停止して `kill` が成功したあとに読み取り・終了待ちが失敗しても、打ち切りの結果 (`timeout` / `aborted by signal`) を維持する
 * (打ち切りの理由は `kill` が成功した時点で確定しており、`SIGKILL` のあとの失敗は結果を変えないため)。
 * 打ち切っていないのに読み取り・終了待ちが失敗したときは子プロセスを強制終了し、子プロセスの終了か猶予 (`_STREAM_GRACE_MS`) の
 * 経過の早い方まで待ってから、reject せず `error` を返す (execution R-219)。
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

/**
 * runner を 1 回呼び、例外を投げ直さずに起動失敗 (`error`) の結果へ変換する (execution R-208 / R-219 / DD-10)。
 * 1 件の実行の失敗で呼び出し側の処理全体 (ベースライン・変異体の並び) を止めないため、reject させない。
 *
 * @param runner - テストを 1 回実行する provider
 * @param args - runner に渡す引数 (変更せずに渡す)
 * @param options - 実行の制限時間と中断信号 (変更せずに渡す)
 * @returns runner が返したテスト実行結果。例外時はそのメッセージを持つ `error`
 */
export const runTestSafely = async (
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
