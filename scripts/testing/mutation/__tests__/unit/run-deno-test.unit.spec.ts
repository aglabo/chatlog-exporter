// src: scripts/testing/mutation/__tests__/unit/run-deno-test.unit.spec.ts
// @(#): run-deno-test のユニットテスト
//       対象: runDenoTest
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
import { runDenoTest } from '../../run-deno-test.ts';

// ─── Helpers
// types
import type { DenoChildProcess, DenoSpawnProvider } from '../../types/mutation.types.ts';

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
 * @returns 開いたままの子プロセスと、それを終了させる `finish`
 */
const _makeOpenChild = (): _OpenChild => {
  const _controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const _openStream = (): ReadableStream<Uint8Array> =>
    new ReadableStream({ start: (controller) => void _controllers.push(controller) });
  const _status = Promise.withResolvers<{ code: number }>();
  return {
    child: { stdout: _openStream(), stderr: _openStream(), status: _status.promise },
    finish: (code: number) => {
      _controllers.forEach((controller) => controller.close());
      _status.resolve({ code });
    },
  };
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
  const { child, finish } = _makeOpenChild();
  return {
    ...child,
    kill: (signal?: Deno.Signal) => {
      kills.push(signal);
      finish(1);
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
  const { child, finish } = _makeOpenChild();
  return {
    ...child,
    kill: () => {
      finish(0);
      throw new TypeError('Child process has already terminated');
    },
  };
};

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
});
