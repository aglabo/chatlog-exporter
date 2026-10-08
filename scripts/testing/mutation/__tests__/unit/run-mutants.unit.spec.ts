// src: scripts/testing/mutation/__tests__/unit/run-mutants.unit.spec.ts
// @(#): run-mutants のユニットテスト
//       対象: runMutants
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertArrayIncludes, assertEquals, assertStrictEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { runMutants } from '../../run-mutants.ts';

// ─── Helpers
import { existsSync } from '@std/fs';
import { join, resolve, toFileUrl } from '@std/path';
// types
import type {
  DenoConfig,
  Mutant,
  MutantStatus,
  RunMutantsOptions,
  TestRunnerProvider,
  TestRunOptions,
  TestRunOutcome,
} from '../../types/mutation.types.ts';

// ─── Internal Helpers

// constants
/** 変異させる元ファイル `target.ts` の中身。 */
const _TARGET_SOURCE = 'export const f = (n: number) => n > 0;\n';

/** 元の設定 `deno.jsonc` の中身。 */
const _BASE_CONFIG = '{ "imports": { "@std/assert": "jsr:@std/assert@^1" } }';

/** 変異体が生き残る (テストが全件成功する) テスト実行結果。 */
const _SURVIVED: TestRunOutcome = { kind: 'exited', code: 0, stdout: 'ok | 1 passed | 0 failed', stderr: '' };

/** 変異体が倒される (テストが失敗する) テスト実行結果。 */
const _KILLED: TestRunOutcome = { kind: 'exited', code: 1, stdout: 'FAILED | 0 passed | 1 failed', stderr: '' };

/** どちらも存在しないことを表す、変異体ファイルと一時設定の有無。 */
const _NO_ARTIFACTS: _ArtifactPresence = { mutantExists: false, configExists: false };

// types
/** 1 件の変異体に対応する変異体ファイルと一時設定の有無。 */
type _ArtifactPresence = {
  /** 変異体ファイルが存在するか。 */
  mutantExists: boolean;
  /** 一時設定が存在するか。 */
  configExists: boolean;
};

/** runner の呼び出し時点で観測した、直前の番号の変異体ファイルと一時設定の有無。 */
type _PreviousArtifacts = _ArtifactPresence & {
  /** 1 始まりの runner の呼び出し回数。 */
  call: number;
};

/** runner の 1 回の呼び出しで受け取った引数。 */
type _RunnerCall = {
  /** runner に渡した `deno` の引数。 */
  args: string[];
  /** runner に渡した実行の制限時間と中断信号。 */
  options: TestRunOptions;
};

/** runner の 1 回の呼び出しで受け取った引数と、呼び出し時点で観測した値。 */
type _ObservedCall<T> = _RunnerCall & {
  /** 呼び出し時点で `observe` が返した値。 */
  observed: T;
};

// functions
/**
 * 変異体番号を、変異体ファイル・一時設定の名前に使う 3 桁のゼロ埋め文字列にする。
 *
 * @param n - 1 始まりの変異体番号
 * @returns `001` 形式の番号
 */
const _seq = (n: number): string => String(n).padStart(3, '0');

/**
 * `dir` の `target.ts` に対する `n` 番の変異体ファイルと一時設定が存在するかを調べる。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param n - 1 始まりの変異体番号
 * @returns `target.mutation-<n>.ts` と `deno.mutation-<n>.json` の有無
 */
const _artifactsExist = (dir: string, n: number): _ArtifactPresence => ({
  mutantExists: existsSync(join(dir, `target.mutation-${_seq(n)}.ts`)),
  configExists: existsSync(join(dir, `deno.mutation-${_seq(n)}.json`)),
});

/**
 * `dir` 内のファイルを `file:` URL にする。一時設定の `imports` のキー・値と比べるために使う。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param name - `dir` 内のファイル名
 * @returns ファイルの `file:` URL
 */
const _fileUrl = (dir: string, name: string): string => toFileUrl(resolve(join(dir, name))).href;

/**
 * 引数に関わらず、指定のテスト実行結果を返す runner スタブを作る。
 * 実プロセスは起動しない (unit runner は `--allow-run` を持たない)。
 *
 * @param outcome - runner が返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRunnerStub = (outcome: TestRunOutcome): TestRunnerProvider => () => Promise.resolve(outcome);

/**
 * n 回目の呼び出しで `outcomes[n - 1]` を返す runner スタブを作る。実プロセスは起動しない。
 *
 * @param outcomes - 呼び出し順に返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeSequenceRunnerStub = (outcomes: TestRunOutcome[]): TestRunnerProvider => {
  let _call = 0;
  return () => Promise.resolve(outcomes[_call++]);
};

/**
 * 1 回目の呼び出しだけ `Error('spawn failed')` で reject し、2 回目以降は `outcome` を返す runner スタブを作る。
 * 実プロセスは起動しない。
 *
 * @param outcome - 2 回目以降に返すテスト実行結果
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeFirstCallThrowingRunnerStub = (outcome: TestRunOutcome): TestRunnerProvider => {
  let _call = 0;
  return () => _call++ === 0 ? Promise.reject(new Error('spawn failed')) : Promise.resolve(outcome);
};

/**
 * `abortAt` 回目の呼び出し中に `ctl.abort()` し、毎回 `_SURVIVED` を返す runner スタブを作る。
 * 実プロセスは起動しない。
 *
 * @param ctl - 中止する `AbortController`
 * @param abortAt - 中止する 1 始まりの呼び出し回数
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeAbortingRunnerStub = (ctl: AbortController, abortAt: number): TestRunnerProvider => {
  let _call = 0;
  return () => {
    _call += 1;
    if (_call === abortAt) {
      ctl.abort();
    }
    return Promise.resolve(_SURVIVED);
  };
};

/**
 * 呼び出しごとに引数・オプションを記録し、`inner` に処理を委ねる runner スタブを作る。実プロセスは起動しない。
 *
 * @param calls - 呼び出しごとに記録を足す先
 * @param inner - 結果を返す runner スタブ (既定は `_SURVIVED` を返すスタブ)
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeRecordingRunnerStub = (
  calls: _RunnerCall[],
  inner: TestRunnerProvider = _makeRunnerStub(_SURVIVED),
): TestRunnerProvider =>
(args: string[], options: TestRunOptions) => {
  calls.push({ args: [...args], options });
  return inner(args, options);
};

/**
 * n 回目 (n >= 2) の呼び出し時に、直前の番号 (n - 1) の変異体ファイルと一時設定が存在するかを記録し、
 * `_SURVIVED` を返す runner スタブを作る。実プロセスは起動しない。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param observed - 2 回目以降の呼び出しごとに観測結果を足す先
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makePreviousArtifactsObserverStub = (
  dir: string,
  observed: _PreviousArtifacts[],
): TestRunnerProvider => {
  let _call = 0;
  return () => {
    _call += 1;
    if (_call >= 2) {
      observed.push({ call: _call, ..._artifactsExist(dir, _call - 1) });
    }
    return Promise.resolve(_SURVIVED);
  };
};

/**
 * 呼び出しごとに引数・オプションと、呼び出し時点の `observe()` の値 (ファイルの内容など) を記録し、
 * `_SURVIVED` を返す runner スタブを作る。実プロセスは起動しない。
 *
 * @param calls - 呼び出しごとに記録を足す先
 * @param observe - 呼び出し時点で評価する観測関数
 * @returns `TestRunnerProvider` 互換のスタブ
 */
const _makeObservingRunnerStub =
  <T>(calls: _ObservedCall<T>[], observe: () => T): TestRunnerProvider => (args: string[], options: TestRunOptions) => {
    calls.push({ args: [...args], options, observed: observe() });
    return Promise.resolve(_SURVIVED);
  };

/**
 * `dir` の `target.ts` 1 行目の `>` を置き換える変異体を作る。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param after - 置換後の字句 (既定は `>=`)
 * @returns `target.ts` の 1 行 35 桁を対象とする変異体
 */
const _m = (dir: string, after = '>='): Mutant => ({
  file: join(dir, 'target.ts'),
  line: 1,
  column: 35,
  op: 'relational',
  before: '>',
  after,
  lineText: 'export const f = (n: number) => n > 0;',
});

/**
 * `dir` の `target.ts` に対する変異体を、置換後の字句ごとに 1 件ずつ並べる。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param afters - 並べる変異体の置換後の字句 (この順に並ぶ)
 * @returns `afters` と同じ順の変異体の並び
 */
const _ms = (dir: string, ...afters: string[]): Mutant[] => afters.map((after) => _m(dir, after));

/**
 * `dir` に `target.ts` と同じ中身の `a.ts` / `b.ts` を書き出し、それぞれを対象とする変異体を 1 件ずつ返す。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @returns `a.ts` / `b.ts` の順の変異体の並び
 */
const _writeTwoTargets = async (dir: string): Promise<Mutant[]> => {
  const _names = ['a.ts', 'b.ts'];
  await Promise.all(_names.map((name) => Deno.writeTextFile(join(dir, name), _TARGET_SOURCE)));
  return _names.map((name) => ({ ..._m(dir), file: join(dir, name) }));
};

/**
 * `dir` の `deno.jsonc` を元の設定とする、既定の実行オプションを作る。
 *
 * @param dir - fixture を置いた一時ディレクトリ
 * @param extra - 既定値を上書き・追加するオプション
 * @returns `runMutants` の実行オプション
 */
const _opts = (dir: string, extra: Partial<RunMutantsOptions> = {}): RunMutantsOptions => ({
  configPath: join(dir, 'deno.jsonc'),
  testArgs: ['test', '--allow-read'],
  timeoutMs: 30000,
  ...extra,
});

// ─── Tests

/**
 * `runMutants` のユニットテストスイート。
 *
 * 変異体を 1 件ずつステージングして runner を呼び、判定を記録して後始末することを検証する
 * (execution R-210 / R-222 / REQ-F-004)。
 *
 * @see runMutants
 */
describe('runMutants', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await Deno.makeTempDir({ prefix: 'run-mutants-' });
    await Deno.writeTextFile(join(dir, 'target.ts'), _TARGET_SOURCE);
    await Deno.writeTextFile(join(dir, 'deno.jsonc'), _BASE_CONFIG);
  });

  afterEach(async () => {
    await Deno.remove(dir, { recursive: true });
  });

  /**
   * runner の結果を `classifyOutcome` で判定し、変異体ごとに記録する (execution R-222 / REQ-F-004 / AC-004)。
   */
  describe('runner の結果から判定を記録する', () => {
    /** runner がテスト実行結果を返す正常ケース。 */
    describe('When: 正常系', () => {
      const _cases: { id: string; label: string; outcome: TestRunOutcome; expected: MutantStatus }[] = [
        {
          id: 'T-MUT-RM-01-01',
          label: '終了コード 1 / FAILED | 0 passed | 1 failed',
          outcome: _KILLED,
          expected: 'killed',
        },
        {
          id: 'T-MUT-RM-01-02',
          label: 'runner が timeout を返す',
          outcome: { kind: 'timeout' },
          expected: 'timeout',
        },
        {
          id: 'T-MUT-RM-01-03',
          label: '終了コード 1 / error: Type checking failed.',
          outcome: { kind: 'exited', code: 1, stdout: '', stderr: 'error: Type checking failed.' },
          expected: 'compile-error',
        },
      ];

      for (const { id, label, outcome, expected } of _cases) {
        it(`[Normal] ${id}: ${label} → ${expected}`, async () => {
          const _result = await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRunnerStub(outcome) }));

          assertEquals(_result.results.length, 1);
          assertEquals(_result.results[0].status, expected);
        });
      }
    });
  });

  /**
   * 前の変異体の後始末が終わってから次の変異体のテストを起動する (execution R-210 / DR-05 / REQ-NF-005)。
   */
  describe('逐次実行', () => {
    /** 複数の変異体を順に実行する正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RM-02-01: 3 件 → 2 回目・3 回目の呼び出し時点で直前の番号の変異体ファイル・一時設定が無い', async () => {
        const _observed: _PreviousArtifacts[] = [];

        await runMutants(
          _ms(dir, '>=', '<', '<='),
          _opts(dir, { testRunner: _makePreviousArtifactsObserverStub(dir, _observed) }),
        );

        assertEquals(_observed, [
          { call: 2, ..._NO_ARTIFACTS },
          { call: 3, ..._NO_ARTIFACTS },
        ]);
      });

      it('[Normal] T-MUT-RM-02-02: survived / killed / timeout の順 → 判定・変異体が入力順に並ぶ', async () => {
        const _runner = _makeSequenceRunnerStub([_SURVIVED, _KILLED, { kind: 'timeout' }]);

        const _result = await runMutants(_ms(dir, '>=', '<', '<='), _opts(dir, { testRunner: _runner }));

        assertEquals(_result.results.map((r) => r.status), ['survived', 'killed', 'timeout']);
        assertEquals(_result.results.map((r) => r.mutant.after), ['>=', '<', '<=']);
      });
    });
  });

  /**
   * 変異体ファイルと一時設定をステージングし、runner へ正しい引数で起動を依頼する
   * (execution R-215 / R-216 / R-217 / DD-02 / REQ-F-003)。
   */
  describe('ステージングと起動の結線', () => {
    /** 変異体 1 件をステージングして runner を呼ぶ正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RM-03-01: > → >= → 起動時点で隣の target.mutation-001.ts が n >= 0 を含む', async () => {
        const _calls: _ObservedCall<string>[] = [];
        const _runner = _makeObservingRunnerStub(
          _calls,
          () => Deno.readTextFileSync(join(dir, 'target.mutation-001.ts')),
        );

        await runMutants([_m(dir, '>=')], _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.map((c) => c.observed), ['export const f = (n: number) => n >= 0;\n']);
      });

      it('[Normal] T-MUT-RM-03-02: 1 件 → --config で deno.mutation-001.json を渡し、その imports が元ファイルを変異体へ向ける', async () => {
        const _tempConfigPath = join(dir, 'deno.mutation-001.json');
        const _calls: _ObservedCall<DenoConfig>[] = [];
        const _runner = _makeObservingRunnerStub(
          _calls,
          () => JSON.parse(Deno.readTextFileSync(_tempConfigPath)) as DenoConfig,
        );

        await runMutants([_m(dir)], _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.length, 1);
        const { args, observed } = _calls[0];
        const _configAt = args.indexOf('--config');
        assertEquals(args.slice(_configAt, _configAt + 2), ['--config', _tempConfigPath]);
        assertEquals(observed.imports?.[_fileUrl(dir, 'target.ts')], _fileUrl(dir, 'target.mutation-001.ts'));
      });

      it('[Normal] T-MUT-RM-03-03: 1 件 → 起動時点・実行後とも target.ts のバイト列が実行前と同一', async () => {
        const _targetPath = join(dir, 'target.ts');
        const _original = new TextEncoder().encode(_TARGET_SOURCE);
        const _calls: _ObservedCall<Uint8Array>[] = [];
        const _runner = _makeObservingRunnerStub(_calls, () => Deno.readFileSync(_targetPath));

        await runMutants([_m(dir)], _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.map((c) => c.observed), [_original]);
        assertEquals(await Deno.readFile(_targetPath), _original);
      });

      it('[Normal] T-MUT-RM-03-04: timeoutMs 30000 → runner は制限時間 30000 を受け取る', async () => {
        const _calls: _RunnerCall[] = [];

        await runMutants([_m(dir)], _opts(dir, { timeoutMs: 30000, testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_calls.map((c) => c.options.timeoutMs), [30000]);
      });

      it('[Normal] T-MUT-RM-03-05: signal を渡す → runner は同一の signal を受け取る', async () => {
        const _ctl = new AbortController();
        const _calls: _RunnerCall[] = [];

        await runMutants([_m(dir)], _opts(dir, { signal: _ctl.signal, testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_calls.length, 1);
        assertStrictEquals(_calls[0].options.signal, _ctl.signal);
      });

      it('[Normal] T-MUT-RM-03-06: testArgs 4 要素 → --config とその値を除いた runner の引数が testArgs と同一・同順', async () => {
        const _testArgs = ['test', '--allow-read', 'a.unit.spec.ts', 'b.unit.spec.ts'];
        const _calls: _RunnerCall[] = [];

        await runMutants(
          [_m(dir)],
          _opts(dir, { testArgs: [..._testArgs], testRunner: _makeRecordingRunnerStub(_calls) }),
        );

        assertEquals(_calls.length, 1);
        const { args } = _calls[0];
        const _configAt = args.indexOf('--config');
        const _withoutConfig = args.filter((_, i) => i !== _configAt && i !== _configAt + 1);
        assertEquals(_withoutConfig, _testArgs);
      });

      it('[Normal] T-MUT-RM-03-07: 1 件 → runner の引数に --import-map で始まる要素が無い', async () => {
        const _calls: _RunnerCall[] = [];

        await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_calls.length, 1);
        assertEquals(_calls[0].args.filter((a) => a.startsWith('--import-map')), []);
      });
    });
  });

  /**
   * 変異体の処理が終わると、作成した変異体ファイルと一時設定を削除する (execution R-225 / REQ-F-006)。
   */
  describe('正常終了時の後始末', () => {
    /** 変異体の処理が正常に終わるケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-RM-04-01: 1 件 → 実行後に target.mutation-001.ts と deno.mutation-001.json が無い', async () => {
        await runMutants([_m(dir)], _opts(dir, { testRunner: _makeRunnerStub(_SURVIVED) }));

        assertEquals(_artifactsExist(dir, 1), _NO_ARTIFACTS);
      });

      it('[Normal] T-MUT-RM-04-02: 2 件 survived → leftovers は [] / interrupted は false', async () => {
        const _result = await runMutants(_ms(dir, '>=', '<'), _opts(dir, { testRunner: _makeRunnerStub(_SURVIVED) }));

        assertEquals(
          { leftovers: _result.leftovers, interrupted: _result.interrupted },
          { leftovers: [], interrupted: false },
        );
      });
    });
  });

  /**
   * 1 件の変異体が失敗しても、その判定を記録して残りの変異体を実行する (execution R-211 / REQ-F-005 / AC-006)。
   */
  describe('変異体単位の失敗の後も続行する', () => {
    /** 途中の変異体で runner が失敗を返すケース。 */
    describe('When: 異常系', () => {
      it("[Error] T-MUT-RM-06-01: 2 回目 { kind: 'error' } → 3 回呼び、判定が survived / error / survived", async () => {
        const _calls: _RunnerCall[] = [];
        const _runner = _makeRecordingRunnerStub(
          _calls,
          _makeSequenceRunnerStub([_SURVIVED, { kind: 'error', message: 'spawn failed' }, _SURVIVED]),
        );

        const _result = await runMutants(_ms(dir, '>=', '<', '<='), _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.length, 3);
        assertEquals(_result.results.map((r) => r.status), ['survived', 'error', 'survived']);
      });

      it("[Error] T-MUT-RM-06-02: 2 回目 { kind: 'timeout' } → 3 回呼び、2 件目の判定が timeout", async () => {
        const _calls: _RunnerCall[] = [];
        const _runner = _makeRecordingRunnerStub(
          _calls,
          _makeSequenceRunnerStub([_SURVIVED, { kind: 'timeout' }, _SURVIVED]),
        );

        const _result = await runMutants(_ms(dir, '>=', '<', '<='), _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.length, 3);
        assertEquals(_result.results[1].status, 'timeout');
      });
    });
  });

  /**
   * runner が例外を投げても、作成した変異体ファイルと一時設定を削除する (execution R-225 / REQ-F-006 / AC-007)。
   */
  describe('runner が例外を投げる', () => {
    /** runner の呼び出しが reject するケース。 */
    describe('When: 異常系', () => {
      it("[Error] T-MUT-RM-07-01: Error('spawn failed') → 実行後に target.mutation-001.ts と deno.mutation-001.json が無い", async () => {
        // reject の扱いは本ケースの検証対象外のため握りつぶし、後始末の結果だけを見る
        await runMutants(
          [_m(dir)],
          _opts(dir, { testRunner: _makeFirstCallThrowingRunnerStub(_SURVIVED) }),
        ).catch(() => {});

        assertEquals(_artifactsExist(dir, 1), _NO_ARTIFACTS);
      });

      it("[Error] T-MUT-RM-07-02: 1 回目だけ Error('spawn failed') → reject せず、判定が error / survived", async () => {
        const _result = await runMutants(
          _ms(dir, '>=', '<'),
          _opts(dir, { testRunner: _makeFirstCallThrowingRunnerStub(_SURVIVED) }),
        );

        assertEquals(_result.results.map((r) => r.status), ['error', 'survived']);
      });
    });
  });

  /**
   * 実行中に中止されると、実行中の変異体の判定を捨てて中断を報告する (execution R-227)。
   */
  describe('実行中の中断', () => {
    /** 変異体の実行中に signal が中止されるケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-10-01: 2 回目の呼び出し中に abort → interrupted は true / 判定は 1 件目の >= のみ', async () => {
        const _ctl = new AbortController();

        const _result = await runMutants(
          _ms(dir, '>=', '<', '<='),
          _opts(dir, { signal: _ctl.signal, testRunner: _makeAbortingRunnerStub(_ctl, 2) }),
        );

        assertEquals(
          { interrupted: _result.interrupted, afters: _result.results.map((r) => r.mutant.after) },
          { interrupted: true, afters: ['>='] },
        );
      });

      it('[Edge] T-MUT-RM-10-02: 2 回目の呼び出し中に abort → 3 件目を開始せず、runner の呼び出しは 2 回', async () => {
        const _ctl = new AbortController();
        const _calls: _RunnerCall[] = [];

        await runMutants(
          _ms(dir, '>=', '<', '<='),
          _opts(dir, {
            signal: _ctl.signal,
            testRunner: _makeRecordingRunnerStub(_calls, _makeAbortingRunnerStub(_ctl, 2)),
          }),
        );

        assertEquals(_calls.length, 2);
      });

      it('[Edge] T-MUT-RM-10-03: 2 回目の呼び出し中に abort → 実行後に target.mutation-002.ts と deno.mutation-002.json が無い', async () => {
        const _ctl = new AbortController();

        await runMutants(
          _ms(dir, '>=', '<', '<='),
          _opts(dir, { signal: _ctl.signal, testRunner: _makeAbortingRunnerStub(_ctl, 2) }),
        );

        assertEquals(_artifactsExist(dir, 2), _NO_ARTIFACTS);
      });

      it('[Edge] T-MUT-RM-10-04: 開始前に abort 済み → runner の呼び出しは 0 回 / 判定は [] / interrupted は true', async () => {
        const _ctl = new AbortController();
        _ctl.abort();
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants(
          _ms(dir, '>=', '<'),
          _opts(dir, { signal: _ctl.signal, testRunner: _makeRecordingRunnerStub(_calls) }),
        );

        assertEquals(
          { calls: _calls.length, results: _result.results, interrupted: _result.interrupted },
          { calls: 0, results: [], interrupted: true },
        );
      });
    });
  });

  /**
   * 全変異体が timeout でも特別扱いせず、全件の判定を記録して完了する (execution R-211 / REQ-F-005)。
   */
  describe('全件が error / timeout', () => {
    /** すべての変異体で runner が timeout を返すケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-11-01: 2 件とも timeout → reject せず、判定が timeout 2 件 / interrupted は false', async () => {
        const _result = await runMutants(
          _ms(dir, '>=', '<'),
          _opts(dir, { testRunner: _makeRunnerStub({ kind: 'timeout' }) }),
        );

        assertEquals(
          { statuses: _result.results.map((r) => r.status), interrupted: _result.interrupted },
          { statuses: ['timeout', 'timeout'], interrupted: false },
        );
      });
    });
  });

  /**
   * 変異体が 0 件なら runner を起動せず、空の結果で完了する (execution R-210 / REQ-F-018)。
   */
  describe('変異体 0 件', () => {
    /** 空の変異体の並びを渡すケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-12-01: [] → runner の呼び出しは 0 回 / 結果は { results: [], leftovers: [], interrupted: false }', async () => {
        const _calls: _RunnerCall[] = [];

        const _result = await runMutants([], _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(
          { calls: _calls.length, result: _result },
          { calls: 0, result: { results: [], leftovers: [], interrupted: false } },
        );
      });
    });
  });

  /**
   * 変異体番号は並びの位置 + 1 とし、変異体ファイル・一時設定の名前に使う (execution R-215 / DD-01)。
   */
  describe('変異体の番号付け', () => {
    /** 同じ元ファイル、または別々の元ファイルに対する変異体を複数渡すケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-MUT-RM-13-01: 同一ファイル 2 件 → 2 回目の呼び出し時点で target.mutation-002.ts と deno.mutation-002.json が存在する', async () => {
        const _calls: _ObservedCall<string[]>[] = [];
        const _runner = _makeObservingRunnerStub(_calls, () => Array.from(Deno.readDirSync(dir), (e) => e.name));

        await runMutants(_ms(dir, '>=', '<'), _opts(dir, { testRunner: _runner }));

        assertArrayIncludes(_calls[1]?.observed ?? [], ['target.mutation-002.ts', 'deno.mutation-002.json']);
      });

      it('[Edge] T-MUT-RM-13-02: a.ts / b.ts 各 1 件 → 各一時設定は自分の元ファイルから変異体への対応 1 件だけを足す', async () => {
        const _mutants = await _writeTwoTargets(dir);
        const _calls: _ObservedCall<Record<string, string>>[] = [];
        let _call = 0;
        const _runner = _makeObservingRunnerStub(_calls, () => {
          _call += 1;
          const _tempConfigPath = join(dir, `deno.mutation-${_seq(_call)}.json`);
          const _imports = (JSON.parse(Deno.readTextFileSync(_tempConfigPath)) as DenoConfig).imports ?? {};
          return Object.fromEntries(Object.entries(_imports).filter(([key]) => key !== '@std/assert'));
        });

        await runMutants(_mutants, _opts(dir, { testRunner: _runner }));

        assertEquals(_calls.map((c) => c.observed), [
          { [_fileUrl(dir, 'a.ts')]: _fileUrl(dir, 'a.mutation-001.ts') },
          { [_fileUrl(dir, 'b.ts')]: _fileUrl(dir, 'b.mutation-002.ts') },
        ]);
      });

      it('[Edge] T-MUT-RM-13-03: a.ts / b.ts 各 1 件 → --config の値が deno.mutation-001.json と deno.mutation-002.json で異なる', async () => {
        const _mutants = await _writeTwoTargets(dir);
        const _calls: _RunnerCall[] = [];

        await runMutants(_mutants, _opts(dir, { testRunner: _makeRecordingRunnerStub(_calls) }));

        assertEquals(_calls.map(({ args }) => args[args.indexOf('--config') + 1]), [
          join(dir, 'deno.mutation-001.json'),
          join(dir, 'deno.mutation-002.json'),
        ]);
      });
    });
  });
});
