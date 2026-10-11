// src: scripts/testing/mutation/__tests__/unit/run-deno-test.unit.spec.ts
// @(#): run-deno-test のユニットテスト
//       対象: runDenoTest, runTestSafely
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertArrayIncludes, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { FakeTime } from '@std/testing/time';

// ─── Test target
import { runDenoTest, runTestSafely } from '../../run-deno-test.ts';

// ─── Helpers
// types
import type {
  DenoChildProcess,
  DenoSpawnProvider,
  TestRunnerProvider,
  TestRunOutcome,
} from '../../types/mutation.types.ts';

// ─── Internal Helpers

// types
/** スタブ子プロセスの振る舞い。 */
type _ChildSpec = {
  /** 終了コード。 */
  code: number;
  /** 標準出力に流す文字列。 */
  stdout: string;
  /** 標準エラーに流す文字列。 */
  stderr: string;
};

/** 子プロセス終了時の結果捕捉のテストケース。 */
type _ExitedCase = {
  /** テスト ID。 */
  id: string;
  /** スタブ子プロセスの終了コードと出力 (期待値の code / stdout / stderr も兼ねる)。 */
  child: _ChildSpec;
};

/** spawn スタブが受け取った起動内容。 */
type _SpawnCall = {
  /** 起動したコマンド名。 */
  cmd: string;
  /** コマンドに渡した起動引数。 */
  args: string[];
};

/** スタブ子プロセスが受け取った `kill` の記録 (1 回の `kill` につき 1 要素)。 */
type _KillLog = (Deno.Signal | undefined)[];

/** 子プロセスの出力ストリームの名前。 */
type _StreamName = 'stdout' | 'stderr';

/** 出力ストリームの underlying source が受け取った `cancel` の記録 (1 回の `cancel` につき 1 要素)。 */
type _CancelLog = _StreamName[];

/** 外から終了させるまで開いたままの子プロセスと、その終了操作。 */
type _OpenChild = {
  /** 標準出力・標準エラーとも開いたままの子プロセス (`kill` は呼び出し側が差し替える)。 */
  child: Omit<DenoChildProcess, 'kill'>;
  /**
   * 標準出力・標準エラーを閉じ、指定の終了コードで子プロセスを終了させる。
   *
   * @param code - 終了コード
   */
  finish: (code: number) => void;
  /**
   * 標準出力・標準エラーを開いたまま、指定の終了コードで子プロセスを終了させる
   * (孫プロセスがパイプを保持し続ける状態)。
   *
   * @param code - 終了コード
   */
  exit: (code: number) => void;
  /** 標準出力・標準エラーそれぞれのコントローラ (閉じる・失敗させる操作に使う)。 */
  controllers: Record<_StreamName, ReadableStreamDefaultController<Uint8Array>>;
};

/** Promise の決着状態。 */
type _Settled<T> =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

/** Promise の決着状態を、決着を待たずに読み出せるようにした追跡器。 */
type _Tracker<T> = {
  /** 現時点の決着状態。 */
  state: _Settled<T>;
};

/** `kill` を記録するだけで終了しない子プロセスを返す spawn スタブと、その操作。 */
type _UnresponsiveChild = {
  /** 毎回同じ子プロセスを返す spawn スタブ (`kill` は記録するだけで、子プロセスを終了させない)。 */
  spawn: DenoSpawnProvider;
  /**
   * 標準出力・標準エラーを開いたまま、指定の終了コードで子プロセスを終了させる。
   *
   * @param code - 終了コード
   */
  exit: (code: number) => void;
  /** 標準出力・標準エラーそれぞれのコントローラ (閉じる・失敗させる操作に使う)。 */
  controllers: Record<_StreamName, ReadableStreamDefaultController<Uint8Array>>;
};

// functions
/**
 * 文字列を 1 チャンクで流して閉じるバイト列ストリームを作る。
 *
 * @param text - ストリームに流す文字列
 * @returns UTF-8 にエンコードした `text` を流すストリーム
 */
const _toStream = (text: string): ReadableStream<Uint8Array> => ReadableStream.from([new TextEncoder().encode(text)]);

/**
 * `finish` を呼ぶまで終了せず、標準出力・標準エラーも閉じない子プロセスを作る。
 *
 * @param cancels - 出力ストリームの underlying source が受け取った `cancel` の記録先 (省略時は記録しない)
 * @returns 開いたままの子プロセスと、それを終了させる `finish` / `exit`、各ストリームのコントローラ
 */
const _makeOpenChild = (cancels: _CancelLog = []): _OpenChild => {
  const _controllers: Partial<Record<_StreamName, ReadableStreamDefaultController<Uint8Array>>> = {};
  const _openStream = (name: _StreamName): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start: (controller) => void (_controllers[name] = controller),
      cancel: () => void cancels.push(name),
    });
  const _stdout = _openStream('stdout');
  const _stderr = _openStream('stderr');
  const _controllerOf = (name: _StreamName): ReadableStreamDefaultController<Uint8Array> => {
    const _controller = _controllers[name];
    if (_controller === undefined) {
      throw new Error(`controller of ${name} is not started`);
    }
    return _controller;
  };
  const _status = Promise.withResolvers<{ code: number }>();
  const _exit = (code: number) => _status.resolve({ code });
  return {
    child: { stdout: _stdout, stderr: _stderr, status: _status.promise },
    finish: (code: number) => {
      _controllerOf('stdout').close();
      _controllerOf('stderr').close();
      _exit(code);
    },
    exit: _exit,
    controllers: { stdout: _controllerOf('stdout'), stderr: _controllerOf('stderr') },
  };
};

/**
 * Promise の決着状態を記録する追跡器を作る。結果を待たずに状態を読めるため、
 * 決着しない Promise に対してもテストを有限時間で失敗させられる。
 *
 * @param promise - 追跡する Promise
 * @returns 決着状態を `state` に保持する追跡器 (決着までは `pending`)
 */
const _track = <T>(promise: Promise<T>): _Tracker<T> => {
  const _tracker: _Tracker<T> = { state: { status: 'pending' } };
  promise.then(
    (value) => void (_tracker.state = { status: 'fulfilled', value }),
    (reason) => void (_tracker.state = { status: 'rejected', reason }),
  );
  return _tracker;
};

/**
 * 指定の終了コードと出力で即座に終了する子プロセスを返す spawn スタブを作る。
 * 実プロセスは起動しない (unit runner は `--allow-run` を持たない)。
 *
 * @param spec - スタブ子プロセスの終了コードと出力
 * @param kills - 受け取った `kill` の記録先 (省略時は記録しない)
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeSpawnStub =
  (spec: _ChildSpec, kills: _KillLog = []): DenoSpawnProvider => (_cmd: string, _args: string[]): DenoChildProcess => ({
    stdout: _toStream(spec.stdout),
    stderr: _toStream(spec.stderr),
    status: Promise.resolve({ code: spec.code }),
    kill: (signal?: Deno.Signal) => void kills.push(signal),
  });

/**
 * 起動内容を `calls` に記録してから、`inner` の子プロセスを返す spawn スタブを作る。
 * 実プロセスは起動しない。
 *
 * @param calls - 起動内容 (コマンド名と起動引数) の記録先
 * @param inner - 子プロセスを作る spawn スタブ (省略時は終了コード 0 で即座に終了する子プロセス)
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeRecordingSpawnStub = (
  calls: _SpawnCall[],
  inner: DenoSpawnProvider = _makeSpawnStub({ code: 0, stdout: '', stderr: '' }),
): DenoSpawnProvider =>
(cmd: string, args: string[]) => {
  calls.push({ cmd, args: [...args] });
  return inner(cmd, args);
};

/**
 * `kill` されるまで終了しない子プロセスを返す spawn スタブを作る。
 * `kill` を受けると、標準出力・標準エラーを閉じ、終了コード 1 で終了する。実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeHangingSpawnStub = (kills: _KillLog): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, finish: _finish } = _makeOpenChild();
  return {
    ..._child,
    kill: (signal?: Deno.Signal) => {
      kills.push(signal);
      _finish(1);
    },
  };
};

/**
 * `kill` を受けた時点で自然終了と競合する子プロセスを返す spawn スタブを作る。
 * `kill` を受けると、標準出力・標準エラーを閉じて終了コード 0 で終了し、
 * 同時に既に終了済みであることを示す `TypeError` を投げる。実プロセスは起動しない。
 *
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeExitRaceSpawnStub = (): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, finish: _finish } = _makeOpenChild();
  return {
    ..._child,
    kill: () => {
      _finish(0);
      throw new TypeError('Child process has already terminated');
    },
  };
};

/**
 * `kill` を受けると終了コード 1 で終了するが、標準出力・標準エラーは閉じない子プロセスを返す spawn スタブを作る
 * (孫プロセスがパイプを保持し続ける状態)。実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @param cancels - 出力ストリームの underlying source が受け取った `cancel` の記録先
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeStuckPipeSpawnStub = (kills: _KillLog, cancels: _CancelLog): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, exit: _exit } = _makeOpenChild(cancels);
  return {
    ..._child,
    kill: (signal?: Deno.Signal) => {
      kills.push(signal);
      _exit(1);
    },
  };
};

/**
 * 起動時点で終了コード 0 で自然終了済みだが、標準出力・標準エラーは途中まで流したまま閉じない子プロセスを返す
 * spawn スタブを作る (孫プロセスがパイプを保持し続ける状態)。
 * 標準出力に 'partial-out'、標準エラーに 'partial-err' を流す。
 * `kill` は既に終了済みであることを示す `TypeError` を投げる。実プロセスは起動しない。
 *
 * @param cancels - 出力ストリームの underlying source が受け取った `cancel` の記録先
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeExitedStuckPipeSpawnStub = (cancels: _CancelLog): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, exit: _exit, controllers: _controllers } = _makeOpenChild(cancels);
  const _encoder = new TextEncoder();
  _controllers.stdout.enqueue(_encoder.encode('partial-out'));
  _controllers.stderr.enqueue(_encoder.encode('partial-err'));
  _exit(0);
  return {
    ..._child,
    kill: () => {
      throw new TypeError('Child process has already terminated');
    },
  };
};

/**
 * 標準出力の読み取りが失敗し、`kill` されるまで終了しない子プロセスを返す spawn スタブを作る。
 * `kill` を受けると、標準エラーを閉じて終了コード 1 で終了する。実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @param error - 標準出力の読み取りで発生させる失敗理由 (`Error` 以外の値も可)
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeReadFailSpawnStub = (kills: _KillLog, error: unknown): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, exit: _exit, controllers: _controllers } = _makeOpenChild();
  _controllers.stdout.error(error);
  return {
    ..._child,
    kill: (signal?: Deno.Signal) => {
      kills.push(signal);
      _controllers.stderr.close();
      _exit(1);
    },
  };
};

/**
 * 標準出力・標準エラーは空で閉じ、終了待ち (`status`) が失敗する子プロセスを返す spawn スタブを作る。
 * 実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @param error - `status` の reject 理由 (`Error` 以外の値も可)
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeStatusFailSpawnStub = (kills: _KillLog, error: unknown): DenoSpawnProvider => (): DenoChildProcess => ({
  stdout: _toStream(''),
  stderr: _toStream(''),
  status: Promise.reject(error),
  kill: (signal?: Deno.Signal) => void kills.push(signal),
});

/**
 * `kill` を記録するだけで終了しない子プロセスと、それを外から終了させる操作を作る。
 * 標準出力・標準エラーは開いたまま、`status` は `exit` を呼ぶまで解決しない。実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @param cancels - 出力ストリームの underlying source が受け取った `cancel` の記録先 (省略時は記録しない)
 * @returns 子プロセスを返す spawn スタブと、その子プロセスの `exit` / 各ストリームのコントローラ
 */
const _makeUnresponsiveChild = (kills: _KillLog, cancels: _CancelLog = []): _UnresponsiveChild => {
  const { child: _child, exit: _exit, controllers: _controllers } = _makeOpenChild(cancels);
  const _process: DenoChildProcess = { ..._child, kill: (signal?: Deno.Signal) => void kills.push(signal) };
  return { spawn: () => _process, exit: _exit, controllers: _controllers };
};

/**
 * 標準出力の読み取りが失敗し、終了コード 1 で終了済みの子プロセスを返す spawn スタブを作る。
 * 標準エラーは開いたまま。`kill` は既に終了済みであることを示す `TypeError` を投げる。実プロセスは起動しない。
 *
 * @param error - 標準出力の読み取りで発生させるエラー
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeReadFailExitedSpawnStub = (error: Error): DenoSpawnProvider => (): DenoChildProcess => {
  const { child: _child, exit: _exit, controllers: _controllers } = _makeOpenChild();
  _controllers.stdout.error(error);
  _exit(1);
  return {
    ..._child,
    kill: () => {
      throw new TypeError('Child process has already terminated');
    },
  };
};

/**
 * `kill` されるまで終了せず、`kill` を受けると標準出力・標準エラーを閉じて、終了待ち (`status`) を失敗させる
 * 子プロセスを返す spawn スタブを作る。実プロセスは起動しない。
 *
 * @param kills - 受け取った `kill` の記録先
 * @param error - `kill` のあとの `status` の reject 理由
 * @returns `DenoSpawnProvider` 互換のスタブ
 */
const _makeStatusFailAfterKillSpawnStub =
  (kills: _KillLog, error: Error): DenoSpawnProvider => (): DenoChildProcess => {
    const { child: _child, controllers: _controllers } = _makeOpenChild();
    const _status = Promise.withResolvers<{ code: number }>();
    return {
      ..._child,
      status: _status.promise,
      kill: (signal?: Deno.Signal) => {
        kills.push(signal);
        _controllers.stdout.close();
        _controllers.stderr.close();
        _status.reject(error);
      },
    };
  };

/**
 * 決着状態から結果の種別を取り出す。決着していなければ `pending`、reject なら `rejected` を返す。
 *
 * @param state - 追跡器の決着状態
 * @returns 結果の種別、または決着状態
 */
const _kindOf = (state: _Settled<TestRunOutcome>): string =>
  state.status === 'fulfilled' ? state.value.kind : state.status;

/**
 * 決着状態から `error` 結果の message を取り出す。`error` で決着していなければ空文字列を返す。
 *
 * @param state - 追跡器の決着状態
 * @returns `error` 結果の message
 */
const _errorMessageOf = (state: _Settled<TestRunOutcome>): string =>
  state.status === 'fulfilled' && state.value.kind === 'error' ? state.value.message : '';

// ─── Tests

/**
 * `runDenoTest` のユニットテストスイート。
 *
 * `deno test` の子プロセスを起動し、終了コードと出力を捕捉することを検証する (execution R-217 / REQ-NF-002)。
 *
 * @see runDenoTest
 */
describe('runDenoTest', () => {
  /**
   * 子プロセスが終了したとき、終了コードと標準出力・標準エラーを保持した `exited` を返す (execution R-217)。
   */
  describe('子プロセス終了時の結果の捕捉', () => {
    /** 子プロセスが制限時間内に終了する正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: _ExitedCase[] = [
        { id: 'T-MUT-RD-01-01', child: { code: 0, stdout: 'ok | 1 passed', stderr: '' } },
        {
          id: 'T-MUT-RD-01-02',
          child: { code: 1, stdout: 'FAILED | 0 passed | 1 failed', stderr: 'error: AssertionError' },
        },
      ];

      for (const { id, child } of _cases) {
        it(`[Normal] ${id}: 終了コード ${child.code} / stdout ${child.stdout} → exited (code / stdout / stderr を保持)`, async () => {
          const _spawn = _makeSpawnStub(child);

          const _result = await runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn });

          assertEquals(_result, { kind: 'exited', ...child });
        });
      }
    });
  });

  /**
   * 渡した起動引数が、加工されずにそのまま `deno` の起動引数になる (execution R-217 / REQ-NF-002)。
   */
  describe('起動引数の受け渡し', () => {
    /** 複数の起動引数を渡す正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RD-02-01: args を渡す → コマンド deno に同じ args が同じ順序で渡る', async () => {
        const _args = ['test', '--config', 'deno.mutation-001.json', 'a.unit.spec.ts'];
        const _calls: _SpawnCall[] = [];

        await runDenoTest(_args, { timeoutMs: 60000, spawn: _makeRecordingSpawnStub(_calls) });

        assertEquals(_calls, [{ cmd: 'deno', args: ['test', '--config', 'deno.mutation-001.json', 'a.unit.spec.ts'] }]);
      });
    });
  });

  /**
   * 子プロセスの起動に失敗したとき、例外を投げ直さず `error` を返す (execution R-219)。
   */
  describe('子プロセスの起動失敗', () => {
    /** 起動時に spawn が例外を投げる異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RD-03-01: spawn が NotFound(deno not found) を throw → reject せず error (message に原因を含む)', async () => {
        const _spawn: DenoSpawnProvider = () => {
          throw new Deno.errors.NotFound('deno not found');
        };

        const _result = await runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn });

        assertEquals(_result.kind, 'error');
        assertStringIncludes(_result.kind === 'error' ? _result.message : '', 'deno not found');
      });

      it("[Error] T-MUT-RD-10-02: spawn が文字列 'boom' を throw → reject せず { kind: 'error', message: 'boom' }", async () => {
        const _spawn: DenoSpawnProvider = () => {
          throw 'boom';
        };

        const _result = await runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn });

        assertEquals(_result, { kind: 'error', message: 'boom' });
      });
    });
  });

  /**
   * 制限時間内に終わらない子プロセスは、直接の子プロセスへ `kill` を送って `timeout` を返す (execution R-218 / DD-04 / REQ-NF-003)。
   */
  describe('制限時間の超過', () => {
    /** 子プロセスが制限時間を超えても終了しない異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RD-04-01: kill まで終了しない子プロセス / timeoutMs 50 → kill を 1 回送り timeout', async () => {
        const _kills: _KillLog = [];

        const _result = await runDenoTest(['test'], { timeoutMs: 50, spawn: _makeHangingSpawnStub(_kills) });

        assertEquals(_kills.length, 1);
        assertEquals(_result, { kind: 'timeout' });
      });
    });
  });

  /**
   * 制限時間内に終了した子プロセスには `kill` を送らず、制限時間のタイマーを残さない (execution R-217 / R-218)。
   * Deno test の sanitizer は残留タイマーを検出しないため、`FakeTime` で終了後に制限時間を経過させ、
   * 残ったタイマーが `kill` を送らないことで非残留を確かめる。sanitizer は無効化しない。
   */
  describe('制限時間内の終了', () => {
    /** 子プロセスが即座に終了し、制限時間に十分な余裕があるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-05-01: 即座に exit 0 / timeoutMs 60000 → kill を送らずタイマーを残さない', async () => {
        const _kills: _KillLog = [];
        const _spawn = _makeSpawnStub({ code: 0, stdout: '', stderr: '' }, _kills);
        using _time = new FakeTime();

        const _result = await runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn });
        _time.tick(60000);

        assertEquals(_kills, []);
        assertEquals(_result, { kind: 'exited', code: 0, stdout: '', stderr: '' });
      });
    });
  });

  /**
   * 実行中に `signal` が中止されたら、直接の子プロセスへ `kill` を送り、制限時間を待たずに `error` を返す (execution R-227)。
   * `FakeTime` で実時間を進めずに検証し、結果が返ったあとに制限時間を経過させて、
   * 制限時間のタイマーが追加の `kill` を送らない (解除済みである) ことも確かめる。
   */
  describe('実行中の中断', () => {
    /** 終了しない子プロセスの実行中に中止されるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-05-02: kill まで終了しない子プロセス / timeoutMs 60000 / 実行中に abort → 制限時間を待たず kill を 1 回送り error', async () => {
        const _kills: _KillLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _running = runDenoTest(['test'], {
          timeoutMs: 60000,
          signal: _ctl.signal,
          spawn: _makeHangingSpawnStub(_kills),
        });
        _ctl.abort();
        const _result = await _running;
        _time.tick(60000);

        assertEquals(_kills.length, 1);
        assertEquals(_result.kind, 'error');
      });
    });
  });

  /**
   * 呼び出し前に `signal` が中止済みなら、子プロセスを起動せず、制限時間を待たずに `error` を返す (execution R-227)。
   * 起動しないため、終了しない子プロセスが残ることもない。`FakeTime` で実時間を進めずに検証する。
   */
  describe('呼び出し前の中断', () => {
    /** 中止済みの signal を渡し、起動されれば終了しない子プロセスになるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-05-04: 呼び出し前に abort 済み / kill まで終了しない子プロセス / timeoutMs 60000 → 起動せず即座に error', async () => {
        const _kills: _KillLog = [];
        const _calls: _SpawnCall[] = [];
        const _spawn = _makeRecordingSpawnStub(_calls, _makeHangingSpawnStub(_kills));
        const _ctl = new AbortController();
        _ctl.abort();
        using _time = new FakeTime();

        const _result = await runDenoTest(['test'], { timeoutMs: 60000, signal: _ctl.signal, spawn: _spawn });
        _time.tick(60000);

        assertEquals(_calls, []);
        assertEquals(_kills, []);
        assertEquals(_result.kind, 'error');
      });
    });
  });

  /**
   * 制限時間到達時の `kill` と子プロセスの自然終了が競合しても、例外を投げずに 1 種類の結果を返す
   * (execution R-218 / R-219 / DD-04)。
   */
  describe('強制終了と自然終了の競合', () => {
    /** `kill` が既に終了済みとして `TypeError` を投げ、同時に終了コード 0 で終わるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-05-05: kill が TypeError を投げ同時に exit 0 / timeoutMs 50 → reject せず exited / timeout / error のいずれか (exited なら code 0)', async () => {
        const _result = await runDenoTest(['test'], { timeoutMs: 50, spawn: _makeExitRaceSpawnStub() });

        assertArrayIncludes(['exited', 'timeout', 'error'], [_result.kind]);
        if (_result.kind === 'exited') {
          assertEquals(_result.code, 0);
        }
      });

      it("[Edge] T-MUT-RD-10-01: kill が TypeError を投げ同時に exit 0 / timeoutMs 50 → { kind: 'exited', code: 0, stdout: '', stderr: '' }", async () => {
        const _result = await runDenoTest(['test'], { timeoutMs: 50, spawn: _makeExitRaceSpawnStub() });

        assertEquals(_result, { kind: 'exited', code: 0, stdout: '', stderr: '' });
      });
    });
  });

  /**
   * 打ち切り (制限時間の超過・実行中の中断) で子プロセスへ送る `kill` は、捕捉・無視できない `SIGKILL` にする
   * (execution R-218 / R-227 / DD-04)。既定の `SIGTERM` では、シグナルを処理する子プロセスが終了しないことがある。
   */
  describe('強制終了のシグナル', () => {
    /** 子プロセスが制限時間を超えても終了しない異常ケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-RD-07-01: kill まで終了しない子プロセス / timeoutMs 50 → kill を SIGKILL で 1 回送り timeout', async () => {
        const _kills: _KillLog = [];

        const _result = await runDenoTest(['test'], { timeoutMs: 50, spawn: _makeHangingSpawnStub(_kills) });

        assertEquals(_kills, ['SIGKILL']);
        assertEquals(_result, { kind: 'timeout' });
      });
    });

    /** 終了しない子プロセスの実行中に中止されるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-07-02: kill まで終了しない子プロセス / timeoutMs 60000 / 実行中に abort → kill を SIGKILL で 1 回送り error', async () => {
        const _kills: _KillLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _running = runDenoTest(['test'], {
          timeoutMs: 60000,
          signal: _ctl.signal,
          spawn: _makeHangingSpawnStub(_kills),
        });
        _ctl.abort();
        const _result = await _running;
        _time.tick(60000);

        assertEquals(_kills, ['SIGKILL']);
        assertEquals(_result.kind, 'error');
      });
    });
  });

  /**
   * 打ち切りで子プロセスが終了しても、孫プロセスがパイプを保持して標準出力・標準エラーが閉じないことがある。
   * 終了後は出力の終端を最大 1000ms だけ待ち、閉じなければ両ストリームの読み取りを打ち切って結果を返す
   * (execution R-218 / R-227 / DD-04)。`FakeTime` で猶予を経過させ、決着しない場合もテストを有限時間で失敗させる。
   */
  describe('打ち切り後に出力が閉じない', () => {
    /** 子プロセスは終了するが出力が閉じず、猶予を経過させるエッジケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-MUT-RD-08-01: kill で終了するが出力が閉じない / timeoutMs 50 → 1000ms の猶予後 { kind: 'timeout' }、stdout・stderr とも cancel", async () => {
        const _kills: _KillLog = [];
        const _cancels: _CancelLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 50, spawn: _makeStuckPipeSpawnStub(_kills, _cancels) }),
        );
        await _time.tickAsync(50);
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: { kind: 'timeout' } });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });

      it('[Edge] T-MUT-RD-08-02: kill で終了するが出力が閉じない / timeoutMs 60000 / 実行中に abort → 1000ms の猶予後 error、stdout・stderr とも cancel', async () => {
        const _kills: _KillLog = [];
        const _cancels: _CancelLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            signal: _ctl.signal,
            spawn: _makeStuckPipeSpawnStub(_kills, _cancels),
          }),
        );
        _ctl.abort();
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });
    });
  });

  /**
   * 子プロセスが自然終了済みで `kill` が例外を投げても、孫プロセスがパイプを保持して出力が閉じないことがある。
   * その場合も終了後は出力の終端を最大 1000ms だけ待ち、閉じなければ両ストリームの読み取りを打ち切って、
   * 打ち切りまでに読めた出力を持つ自然終了の `exited` を返す (execution R-218 / R-219 / DD-04 / REQ-NF-003)。
   * `FakeTime` で猶予を経過させ、決着しない場合もテストを有限時間で失敗させる。
   */
  describe('強制終了の失敗後に出力が閉じない', () => {
    /** 自然終了済みの子プロセスへの `kill` が `TypeError` を投げ、出力が閉じないまま猶予を経過させるエッジケース。 */
    describe('When: エッジケース', () => {
      const _expected: TestRunOutcome = { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' };

      it("[Edge] T-MUT-RD-11-01: exit 0 済み・出力が閉じない・kill が TypeError / timeoutMs 50 → 1000ms の猶予後 { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' }、stdout・stderr とも cancel 1 回", async () => {
        const _cancels: _CancelLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 50, spawn: _makeExitedStuckPipeSpawnStub(_cancels) }),
        );
        await _time.tickAsync(50);
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: _expected });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });

      it("[Edge] T-MUT-RD-11-02: exit 0 済み・出力が閉じない・kill が TypeError / timeoutMs 60000 / 実行中に abort → 1000ms の猶予後 { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' }、stdout・stderr とも cancel 1 回", async () => {
        const _cancels: _CancelLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            signal: _ctl.signal,
            spawn: _makeExitedStuckPipeSpawnStub(_cancels),
          }),
        );
        _ctl.abort();
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: _expected });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });
    });
  });

  /**
   * 出力の読み取りや終了待ちが失敗しても reject せず、子プロセスへ `kill` を 1 回送り、
   * 原因のメッセージを持つ `error` を返す (execution R-219)。
   * `FakeTime` で猶予を経過させ、決着しない場合もテストを有限時間で失敗させる。
   */
  describe('読み取り・終了待ちの失敗', () => {
    /** 標準出力の読み取り、または終了待ちが失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it("[Error] T-MUT-RD-09-01: stdout の読み取りが Error('read failed') で失敗 / kill まで終了しない → reject せず error (message に read failed)、kill を 1 回送る", async () => {
        const _kills: _KillLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            spawn: _makeReadFailSpawnStub(_kills, new Error('read failed')),
          }),
        );
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertStringIncludes(_errorMessageOf(_tracker.state), 'read failed');
        assertEquals(_kills.length, 1);
      });

      it("[Error] T-MUT-RD-09-02: status が Error('status failed') で reject / 出力は閉じる → reject せず error (message に status failed)、kill を 1 回送る", async () => {
        const _kills: _KillLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            spawn: _makeStatusFailSpawnStub(_kills, new Error('status failed')),
          }),
        );
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertStringIncludes(_errorMessageOf(_tracker.state), 'status failed');
        assertEquals(_kills.length, 1);
      });
    });
  });

  /**
   * 出力に含まれる ANSI エスケープは除去せず、そのまま返す (execution R-217 / DD-03)。
   * ANSI の除去は判定側の責務であり、実行側は出力を加工しない。
   */
  describe('出力の無加工', () => {
    /** 標準エラーに ANSI エスケープを含む色付きのエラー出力が流れるエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RD-05-03: stderr に ANSI エスケープを含む / exit 1 → stderr をエスケープごと完全一致で返す', async () => {
        const _stderr = '\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed.';
        const _spawn = _makeSpawnStub({ code: 1, stdout: '', stderr: _stderr });

        const _result = await runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn });

        assertEquals(_result, {
          kind: 'exited',
          code: 1,
          stdout: '',
          stderr: '\x1b[0m\x1b[1m\x1b[31merror\x1b[0m: Type checking failed.',
        });
      });
    });
  });

  /**
   * 読み取り・終了待ちが失敗したときの後始末と、打ち切り処理の一回性 (execution R-218 / R-219 / R-227 / DD-04)。
   * 打ち切っていないのに失敗したときは、子プロセスへ `kill` を送ったあと、最大 1000ms だけ `status` の解決を待ってから
   * 原因のメッセージを持つ `error` を返す。`kill` が例外を投げても reject しない。
   * 打ち切ったあとに `status` が失敗しても、打ち切りの結果 (`timeout` / 中断の `error`) を維持する。
   * 打ち切り処理は 1 回限りで、中断後の猶予中に制限時間が来ても `kill` を再送しない。
   * `FakeTime` で時間を進め、決着しない場合もテストを有限時間で失敗させる。
   */
  describe('失敗経路の後始末と停止の一回性', () => {
    /** 読み取り・終了待ちが失敗する異常ケース。 */
    describe('When: 異常系', () => {
      it("[Error] T-MUT-RD-12-01: stdout の読み取りが Error('read failed') で失敗 / kill では終了せず 300ms 後に exit 1 → exit までは pending (kill は SIGKILL 1 回)、exit 後に error (message に read failed)", async () => {
        const _kills: _KillLog = [];
        const { spawn: _spawn, exit: _exit, controllers: _controllers } = _makeUnresponsiveChild(_kills);
        _controllers.stdout.error(new Error('read failed'));
        using _time = new FakeTime();

        const _tracker = _track(runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn }));
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_kills, ['SIGKILL']);

        await _time.tickAsync(300);
        _exit(1);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertStringIncludes(_errorMessageOf(_tracker.state), 'read failed');
      });

      it("[Error] T-MUT-RD-12-02: stdout の読み取りが Error('read failed') で失敗 / kill 後も終了しない → kill から 999ms は pending、1000ms で error (message に read failed)", async () => {
        const _kills: _KillLog = [];
        const { spawn: _spawn, controllers: _controllers } = _makeUnresponsiveChild(_kills);
        _controllers.stdout.error(new Error('read failed'));
        using _time = new FakeTime();

        const _tracker = _track(runDenoTest(['test'], { timeoutMs: 60000, spawn: _spawn }));
        await _time.runMicrotasks();
        await _time.tickAsync(999);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });

        await _time.tickAsync(1);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertStringIncludes(_errorMessageOf(_tracker.state), 'read failed');
      });

      it("[Error] T-MUT-RD-12-03: stdout の読み取りが Error('read failed') で失敗 / exit 1 済み / kill が TypeError → reject せず error (message に read failed)", async () => {
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 60000, spawn: _makeReadFailExitedSpawnStub(new Error('read failed')) }),
        );
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertStringIncludes(_errorMessageOf(_tracker.state), 'read failed');
      });

      it("[Error] T-MUT-RD-12-04: stdout の読み取りが文字列 'read boom' で失敗 / kill で終了 → { kind: 'error', message: 'read boom' }", async () => {
        const _kills: _KillLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 60000, spawn: _makeReadFailSpawnStub(_kills, 'read boom') }),
        );
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: { kind: 'error', message: 'read boom' } });
      });

      it("[Error] T-MUT-RD-12-05: status が文字列 'status boom' で reject / 出力は空で閉じる → { kind: 'error', message: 'status boom' }", async () => {
        const _kills: _KillLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 60000, spawn: _makeStatusFailSpawnStub(_kills, 'status boom') }),
        );
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: { kind: 'error', message: 'status boom' } });
      });
    });

    /** 打ち切りのあとで終了待ちが失敗する、または別の打ち切りが重なるエッジケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-MUT-RD-12-06: kill は成功し、その後 status が Error('status failed after kill') で reject / timeoutMs 50 → { kind: 'timeout' }", async () => {
        const _kills: _KillLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 50,
            spawn: _makeStatusFailAfterKillSpawnStub(_kills, new Error('status failed after kill')),
          }),
        );
        await _time.tickAsync(50);
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_kills, ['SIGKILL']);
        assertEquals(_tracker.state, { status: 'fulfilled', value: { kind: 'timeout' } });
      });

      it("[Edge] T-MUT-RD-12-07: kill は成功し、その後 status が Error('status failed after kill') で reject / timeoutMs 60000 / 実行中に abort → { kind: 'error', message: 'aborted by signal' }", async () => {
        const _kills: _KillLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            signal: _ctl.signal,
            spawn: _makeStatusFailAfterKillSpawnStub(_kills, new Error('status failed after kill')),
          }),
        );
        _ctl.abort();
        await _time.tickAsync(1000);
        await _time.runMicrotasks();

        assertEquals(_kills, ['SIGKILL']);
        assertEquals(_tracker.state, {
          status: 'fulfilled',
          value: { kind: 'error', message: 'aborted by signal' },
        });
      });

      it('[Edge] T-MUT-RD-12-08: kill で終了するが出力が閉じない / timeoutMs 500 / 開始直後に abort → 猶予中に制限時間が来ても kill は SIGKILL 1 回だけ、1000ms で error', async () => {
        const _kills: _KillLog = [];
        const _cancels: _CancelLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 500,
            signal: _ctl.signal,
            spawn: _makeStuckPipeSpawnStub(_kills, _cancels),
          }),
        );
        _ctl.abort();
        await _time.tickAsync(500);
        await _time.runMicrotasks();

        assertEquals(_kills, ['SIGKILL']);

        await _time.tickAsync(500);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
      });
    });
  });

  /**
   * 出力の終端を待つ猶予 (1000ms) の境界 (execution R-218 / R-227 / DD-04)。
   * 猶予は `kill` の時点ではなく子プロセスの終了 (`status` の解決) から数え、満了の 1ms 前までは読み取りを打ち切らない。
   * `kill` が例外を投げた (既に自然終了していた) 場合も、同じ境界で読み取りを打ち切る。
   * `FakeTime` で時間を進め、決着しない場合もテストを有限時間で失敗させる。
   */
  describe('猶予の境界', () => {
    /** 猶予の起点と満了の直前・直後を確かめるエッジケース。 */
    describe('When: エッジケース', () => {
      it("[Edge] T-MUT-RD-13-01: kill では終了せず kill から 300ms 後に exit 1・出力は閉じない / timeoutMs 50 → exit から 999ms は pending で cancel なし、1000ms で { kind: 'timeout' }、stdout・stderr とも cancel", async () => {
        const _kills: _KillLog = [];
        const _cancels: _CancelLog = [];
        const { spawn: _spawn, exit: _exit } = _makeUnresponsiveChild(_kills, _cancels);
        using _time = new FakeTime();

        const _tracker = _track(runDenoTest(['test'], { timeoutMs: 50, spawn: _spawn }));
        await _time.tickAsync(50);
        await _time.tickAsync(300);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        _exit(1);
        await _time.tickAsync(999);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        await _time.tickAsync(1);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'fulfilled', value: { kind: 'timeout' } });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });

      it('[Edge] T-MUT-RD-13-02: kill では終了せず kill から 300ms 後に exit 1・出力は閉じない / timeoutMs 60000 / 開始直後に abort → exit から 999ms は pending で cancel なし、1000ms で error、stdout・stderr とも cancel', async () => {
        const _kills: _KillLog = [];
        const _cancels: _CancelLog = [];
        const _ctl = new AbortController();
        const { spawn: _spawn, exit: _exit } = _makeUnresponsiveChild(_kills, _cancels);
        using _time = new FakeTime();

        const _tracker = _track(runDenoTest(['test'], { timeoutMs: 60000, signal: _ctl.signal, spawn: _spawn }));
        _ctl.abort();
        await _time.tickAsync(300);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        _exit(1);
        await _time.tickAsync(999);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        await _time.tickAsync(1);
        await _time.runMicrotasks();

        assertEquals(_kindOf(_tracker.state), 'error');
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });

      it("[Edge] T-MUT-RD-13-03: exit 0 済み・出力が閉じない・kill が TypeError / timeoutMs 50 → kill から 999ms は pending で cancel なし、1000ms で { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' }、stdout・stderr とも cancel", async () => {
        const _cancels: _CancelLog = [];
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], { timeoutMs: 50, spawn: _makeExitedStuckPipeSpawnStub(_cancels) }),
        );
        await _time.tickAsync(50);
        await _time.tickAsync(999);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        await _time.tickAsync(1);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, {
          status: 'fulfilled',
          value: { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' },
        });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });

      it("[Edge] T-MUT-RD-13-04: exit 0 済み・出力が閉じない・kill が TypeError / timeoutMs 60000 / 開始直後に abort → 999ms は pending、1000ms で { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' }、stdout・stderr とも cancel", async () => {
        const _cancels: _CancelLog = [];
        const _ctl = new AbortController();
        using _time = new FakeTime();

        const _tracker = _track(
          runDenoTest(['test'], {
            timeoutMs: 60000,
            signal: _ctl.signal,
            spawn: _makeExitedStuckPipeSpawnStub(_cancels),
          }),
        );
        _ctl.abort();
        await _time.tickAsync(999);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, { status: 'pending' });
        assertEquals(_cancels, []);

        await _time.tickAsync(1);
        await _time.runMicrotasks();

        assertEquals(_tracker.state, {
          status: 'fulfilled',
          value: { kind: 'exited', code: 0, stdout: 'partial-out', stderr: 'partial-err' },
        });
        assertEquals([..._cancels].sort(), ['stderr', 'stdout']);
      });
    });
  });
});

/**
 * `runTestSafely` のユニットテストスイート。
 *
 * runner の例外を投げ直さず、原因を保持した `error` の結果へ変換することを検証する (execution R-208 / R-219 / DD-10)。
 *
 * @see runTestSafely
 */
describe('runTestSafely', () => {
  /**
   * runner が例外を投げたら reject せず、例外の内容を message に持つ `error` を返す (execution R-219)。
   * `Error` 以外の値が投げられた場合も、文字列化した値を message にする。
   */
  describe('runner の例外の変換', () => {
    /** runner が `Error` または `Error` 以外の値を投げる異常ケース。 */
    describe('When: 異常系', () => {
      const _cases: { id: string; label: string; thrown: unknown; message: string }[] = [
        { id: 'T-MUT-RD-06-01', label: "文字列 'boom' を throw", thrown: 'boom', message: 'boom' },
        { id: 'T-MUT-RD-06-02', label: "Error('boom') を throw", thrown: new Error('boom'), message: 'boom' },
      ];

      for (const { id, label, thrown, message } of _cases) {
        it(`[Error] ${id}: runner が ${label} → reject せず { kind: 'error', message: '${message}' }`, async () => {
          const _runner: TestRunnerProvider = () => Promise.reject(thrown);

          const _result = await runTestSafely(_runner, ['test'], { timeoutMs: 60000 });

          assertEquals(_result, { kind: 'error', message });
        });
      }
    });
  });
});
