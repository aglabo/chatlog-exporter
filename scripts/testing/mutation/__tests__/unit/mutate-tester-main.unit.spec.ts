// src: scripts/testing/mutation/__tests__/unit/mutate-tester-main.unit.spec.ts
// @(#): mutate-tester の監査の順序制御のユニットテスト
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import {
  assert,
  assertEquals,
  assertFalse,
  assertNotEquals,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
} from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../../mutate-tester.ts';

// ─── Helpers
import { dirname, join } from '@std/path';
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import {
  BASELINE_ABORT_DRIFT_MESSAGE,
  BASELINE_REASON_NONZERO_EXIT,
  DENO_CONFIG_PATH,
  EXIT_CODE_FAILURE,
  MUTATION_TEST_PERMISSIONS,
  REPO_ROOT,
  REPORT_NO_MUTANTS,
  REPORT_WRITE_FAILURE_MESSAGE,
  WRONG_WORKING_DIRECTORY_MESSAGE,
} from '../../constants/mutation.constants.ts';
import { formatReport } from '../../report.ts';
import { runDenoTest } from '../../run-deno-test.ts';
import {
  driftingHashSources,
  driftSection,
  FAKE_SOURCES,
  FAKE_TESTS,
  makeMainDeps,
  mutant,
  outcomeOf,
  withLoggerStub,
} from '../helpers/main-fakes.ts';

// types
import type {
  AllowlistEntry,
  MainDeps,
  Mutant,
  MutantResult,
  RunMutantsOptions,
  TestRunnerProvider,
} from '../../types/mutation.types.ts';

// ─── Internal Helpers

// functions

/**
 * 呼ばれると必ず指定のエラーで reject する fake を作る。
 *
 * @param error - reject に使うエラー
 * @returns 引数を無視して `error` で reject する関数
 */
const _throwing = (error: Error) => (): Promise<never> => Promise.reject(error);

// ─── Tests

/**
 * `main` のユニットテストスイート。
 *
 * 注入した fake の呼び出し記録で、監査の工程の順序・中止経路・終了コードを検証する。
 *
 * @see main
 */
describe('main', () => {
  /** すべての工程が成功する監査。 */
  describe('When: 正常系', () => {
    /** 対象ソースを `libs/a.ts`, `libs/b.ts` の 2 件にする依存の差し替え。 */
    const _twoSources: Partial<MainDeps> = {
      resolveTargets: () => Promise.resolve({ sources: ['libs/a.ts', 'libs/b.ts'], tests: [...FAKE_TESTS] }),
    };

    it('[Normal] T-MUT-MT-10-01: 全 fake 成功・変異体 1 件 → 工程が規定の順序で呼ばれる', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps();

      await main(['libs'], _deps);

      assertEquals(_calls, [
        'resolveTargets',
        'loadAllowlist',
        'acquireLock',
        'signals.onInterrupt',
        'sweepArtifacts',
        'hashSources',
        'runBaseline',
        'generateMutants',
        'runMutants',
        'matchAllowlist',
        'hashSources',
        'writeReport',
        'releaseLock',
      ]);
    });

    it('[Normal] T-MUT-MT-10-02: 全 fake 成功・killed 1 件 → 同じ入力の formatReport の出力を writeReport へ 1 回渡す', async () => {
      const _written: string[] = [];
      const { deps: _deps } = makeMainDeps({ writeReport: (text) => void _written.push(text) });

      await main(['libs'], _deps);

      const _expected = formatReport({
        generatedCount: 1,
        results: [{ mutant: mutant('libs/a.ts', 1), status: 'killed' }],
        match: { allowed: [], unallowed: [], stale: [] },
        drift: [],
        leftovers: [],
        interrupted: false,
        auditFailures: [],
      });
      assertEquals(_written, [_expected]);
    });

    /** 全変異体が生存し、そのすべてを許容リストが許容しない依存の差し替え。 */
    const _survivedUnallowed: Partial<MainDeps> = {
      runMutants: (mutants) =>
        Promise.resolve({
          results: mutants.map((m) => ({ mutant: m, status: 'survived' as const })),
          leftovers: [],
          interrupted: false,
        }),
      matchAllowlist: (mutants) => ({ allowed: [], unallowed: [...mutants], stale: [] }),
    };

    it('[Normal] T-MUT-MT-10-03: survived 1 件・未許容・--strict なし → 0 を返す', async () => {
      const { deps: _deps } = makeMainDeps(_survivedUnallowed);

      const _code = await main(['libs'], _deps);

      assertEquals(_code, 0);
    });

    it('[Normal] T-MUT-MT-10-04: survived 1 件・未許容・--strict あり → EXIT_CODE_FAILURE (1) を返す', async () => {
      const { deps: _deps } = makeMainDeps(_survivedUnallowed);

      const _code = await main(['libs', '--strict'], _deps);

      assertEquals(_code, EXIT_CODE_FAILURE);
    });

    it('[Normal] T-MUT-MT-10-05: --timeout 30 → runBaseline と runMutants の timeoutMs がどちらも 30000', async () => {
      const _timeouts: Record<string, number> = {};
      const { deps: _base } = makeMainDeps();
      const { deps: _deps } = makeMainDeps({
        runBaseline: (runner, args, options) => {
          _timeouts.runBaseline = options.timeoutMs;
          return _base.runBaseline(runner, args, options);
        },
        runMutants: (mutants, options) => {
          _timeouts.runMutants = options.timeoutMs;
          return _base.runMutants(mutants, options);
        },
      });

      await main(['libs', '--timeout', '30'], _deps);

      assertEquals(_timeouts, { runBaseline: 30000, runMutants: 30000 });
    });

    it('[Normal] T-MUT-MT-10-06: ソース 2 件・各 1 件生成 → runMutants へソース順の変異体 2 件を渡す', async () => {
      const _passed: Mutant[][] = [];
      const { deps: _base } = makeMainDeps();
      const { deps: _deps } = makeMainDeps({
        ..._twoSources,
        runMutants: (mutants, options) => {
          _passed.push([...mutants]);
          return _base.runMutants(mutants, options);
        },
      });

      await main(['libs'], _deps);

      assertEquals(_passed, [[mutant('libs/a.ts', 1), mutant('libs/b.ts', 1)]]);
    });

    /** どのソースからも変異体を生成しない依存の差し替え。 */
    const _noMutants: Partial<MainDeps> = { generateMutants: () => [] };

    it('[Normal] T-MUT-MT-11-01: generateMutants が全ソースで 0 件 → runMutants を呼ばない', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({ ..._noMutants, ..._twoSources });

      await main(['libs'], _deps);

      assertFalse(_calls.includes('runMutants'));
    });

    it('[Normal] T-MUT-MT-11-02: generateMutants が全ソースで 0 件・許容リストが空 → 変異体 0 件をレポートし 0 を返す', async () => {
      const _written: string[] = [];
      const { deps: _deps } = makeMainDeps({
        ..._noMutants,
        loadAllowlist: () => Promise.resolve([]),
        writeReport: (text) => void _written.push(text),
      });

      const _code = await main(['libs'], _deps);

      assertEquals(_written.length, 1);
      assertStringIncludes(_written[0], REPORT_NO_MUTANTS);
      assertEquals(_code, 0);
    });

    it('[Normal] T-MUT-MT-11-03: generateMutants が 0 件・許容リストがエントリ 1 件 → matchAllowlist を ([], [], [そのエントリ]) で 1 回呼ぶ', async () => {
      const _entry: AllowlistEntry = {
        file: 'libs/a.ts',
        lineText: 'export const a = 1 < 2;',
        op: 'relational',
        before: '<',
        after: '<=',
        occurrence: 1,
        reason: '等価変異体',
      };
      const _matchArgs: [Mutant[], MutantResult[], AllowlistEntry[]][] = [];
      const { deps: _deps } = makeMainDeps({
        ..._noMutants,
        loadAllowlist: () => Promise.resolve([_entry]),
        matchAllowlist: (mutants, results, entries) => {
          _matchArgs.push([[...mutants], [...results], [...entries]]);
          return { allowed: [], unallowed: [], stale: [...entries] };
        },
      });

      await main(['libs'], _deps);

      assertEquals(_matchArgs, [[[], [], [_entry]]]);
    });

    it('[Normal] T-MUT-MT-11-04: generateMutants が全ソースで 0 件 → runBaseline を 1 回、generateMutants より前に呼ぶ', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps(_noMutants);

      await main(['libs'], _deps);

      const _focus = _calls.filter((name) => name === 'runBaseline' || name === 'generateMutants');
      assertEquals(_focus, ['runBaseline', 'generateMutants']);
    });

    /** `runBaseline` と `runMutants` が受け取った引数の記録。 */
    type _RunnerArgs = {
      /** `runBaseline` が受け取ったテストの起動関数とテスト引数 (呼び出しごと)。 */
      baseline: [TestRunnerProvider, string[]][];
      /** `runMutants` が受け取ったオプション (呼び出しごと)。 */
      mutants: RunMutantsOptions[];
    };

    /**
     * `runBaseline` と `runMutants` が受け取った引数を記録し、既定の fake に委譲する依存を作る。
     *
     * 記録配列を持つため、テストごとに新しく作る (テスト間で共有しない)。
     *
     * @param overrides - 既定の fake から追加で差し替える依存
     * @returns 記録付きの依存の一式と引数の記録
     */
    const _recordingRunners = (overrides: Partial<MainDeps> = {}): { deps: MainDeps; args: _RunnerArgs } => {
      const _args: _RunnerArgs = { baseline: [], mutants: [] };
      const { deps: _base } = makeMainDeps();
      const { deps: _deps } = makeMainDeps({
        ...overrides,
        runBaseline: (runner, args, options) => {
          _args.baseline.push([runner, [...args]]);
          return _base.runBaseline(runner, args, options);
        },
        runMutants: (mutants, options) => {
          _args.mutants.push(options);
          return _base.runMutants(mutants, options);
        },
      });
      return { deps: _deps, args: _args };
    };

    it('[Normal] T-MUT-MT-32-01: 全 fake 成功 → runBaseline の第 1 引数が production の runDenoTest と同一の関数', async () => {
      const { deps: _deps, args: _args } = _recordingRunners();

      await main(['libs'], _deps);

      assertEquals(_args.baseline.length, 1);
      assertStrictEquals(_args.baseline[0][0], runDenoTest);
    });

    it('[Normal] T-MUT-MT-32-02: resolveTargets がテスト 2 件を返す → runBaseline のテスト引数が [test, ...MUTATION_TEST_PERMISSIONS, テスト 1, テスト 2]', async () => {
      const _tests = ['libs/__tests__/unit/a.unit.spec.ts', 'libs/__tests__/unit/b.unit.spec.ts'];
      const { deps: _deps, args: _args } = _recordingRunners({
        resolveTargets: () => Promise.resolve({ sources: ['libs/a.ts'], tests: [..._tests] }),
      });

      await main(['libs'], _deps);

      assertEquals(_args.baseline.map(([, args]) => args), [['test', ...MUTATION_TEST_PERMISSIONS, ..._tests]]);
    });

    it('[Normal] T-MUT-MT-32-03: 変異体 1 件を生成 → runMutants の configPath が DENO_CONFIG_PATH', async () => {
      const { deps: _deps, args: _args } = _recordingRunners();

      await main(['libs'], _deps);

      assertEquals(_args.mutants.map((options) => options.configPath), [DENO_CONFIG_PATH]);
    });

    it('[Normal] T-MUT-MT-32-04: 変異体 1 件を生成 → runMutants の testArgs が runBaseline のテスト引数と一致する', async () => {
      const { deps: _deps, args: _args } = _recordingRunners();

      await main(['libs'], _deps);

      assertEquals(_args.baseline.length, 1);
      assertEquals(_args.mutants.map((options) => [...options.testArgs]), [_args.baseline[0][1]]);
    });

    it('[Normal] T-MUT-MT-30-02: cwd が REPO_ROOT → acquireLock を 1 回呼び 0 を返す', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({ cwd: () => REPO_ROOT });

      const _code = await main(['libs'], _deps);

      assertEquals(_calls.filter((name) => name === 'acquireLock'), ['acquireLock']);
      assertEquals(_code, 0);
    });

    it('[Normal] T-MUT-MT-30-03: cwd が REPO_ROOT から末尾の区切り文字を除いた文字列 → 同じ作業ディレクトリとみなし 0 を返す', async () => {
      const _trimmed = REPO_ROOT.replace(/[\\/]+$/, '');
      const { deps: _deps } = makeMainDeps({ cwd: () => _trimmed });

      const _code = await main(['libs'], _deps);

      assertEquals(_code, 0);
    });
  });

  /** 監査を中止する経路。 */
  describe('When: 異常系', () => {
    it('[Error] T-MUT-MT-12-01: argv が [unknown] → 不明なモジュール名の ChatlogError で reject する', async () => {
      const { deps: _deps } = makeMainDeps();

      const _error = await assertRejects(() => main(['unknown'], _deps), ChatlogError);

      assertStringIncludes(_error.message, 'unknown');
    });

    /** 引数解析で reject する argv。どの依存も呼ばれる前に中止する。 */
    const _invalidArgvCases: { id: string; argv: string[] }[] = [
      { id: 'T-MUT-MT-12-02', argv: ['unknown'] },
      { id: 'T-MUT-MT-12-03', argv: ['libs', '--timeout', '0'] },
    ];

    for (const { id, argv } of _invalidArgvCases) {
      it(`[Error] ${id}: argv が [${argv.join(', ')}] → reject 後も呼び出し記録が空 (どの依存も呼ばない)`, async () => {
        const { deps: _deps, calls: _calls } = makeMainDeps();

        await assertRejects(() => main(argv, _deps), ChatlogError);

        assertEquals(_calls, []);
      });
    }

    it('[Error] T-MUT-MT-13-01: loadAllowlist が全エラーを列挙した ChatlogError を投げる → 同じインスタンスで reject し message に列挙を含む', async () => {
      const _thrown = new ChatlogError('InvalidArgs', 'InvalidAllowlist', 'reason が空です; occurrence が不正です');
      const { deps: _deps } = makeMainDeps({ loadAllowlist: _throwing(_thrown) });

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertStrictEquals(_error, _thrown);
      assertStringIncludes(_error.message, 'reason が空です; occurrence が不正です');
    });

    it('[Error] T-MUT-MT-13-02: loadAllowlist と acquireLock がどちらも ChatlogError を投げる → acquireLock・sweepArtifacts を呼ばず許容リストのエラーで reject する', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        loadAllowlist: _throwing(new ChatlogError('InvalidArgs', 'InvalidAllowlist', 'allowlist broken')),
        acquireLock: _throwing(new ChatlogError('InvalidArgs', 'LockHeld', 'lock held')),
      });

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertFalse(_calls.includes('acquireLock'));
      assertFalse(_calls.includes('sweepArtifacts'));
      assertStringIncludes(_error.message, 'allowlist broken');
    });

    it('[Error] T-MUT-MT-13-03: loadAllowlist が ChatlogError を投げる → reject 後も writeReport を呼ばない (レポートを構成しない)', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        loadAllowlist: _throwing(new ChatlogError('InvalidArgs', 'InvalidAllowlist', 'allowlist broken')),
      });

      await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertFalse(_calls.includes('writeReport'));
    });

    it('[Error] T-MUT-MT-14-01: acquireLock が ChatlogError を投げる (前回の強制終了で残ったロック) → 同じ ChatlogError で reject する', async () => {
      const _thrown = new ChatlogError('InvalidArgs', 'LockHeld', 'lock held');
      const { deps: _deps } = makeMainDeps({ acquireLock: _throwing(_thrown) });

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertStrictEquals(_error, _thrown);
    });

    /** ロックの取得に失敗して中止したとき、呼ばれてはならない依存。 */
    const _lockFailureCases: { id: string; skipped: string[]; reason: string }[] = [
      {
        id: 'T-MUT-MT-14-02',
        skipped: ['sweepArtifacts', 'hashSources', 'runBaseline', 'runMutants'],
        reason: '別のハーネスが実行中なので何も削除せず実行もしない',
      },
      { id: 'T-MUT-MT-14-03', skipped: ['releaseLock'], reason: '取得できなかったロックは解放しない' },
      { id: 'T-MUT-MT-14-04', skipped: ['writeReport'], reason: 'レポートを構成しない' },
    ];

    for (const { id, skipped, reason } of _lockFailureCases) {
      it(`[Error] ${id}: acquireLock が ChatlogError を投げる → reject 後も ${skipped.join('・')} を呼ばない (${reason})`, async () => {
        const { deps: _deps, calls: _calls } = makeMainDeps({
          acquireLock: _throwing(new ChatlogError('InvalidArgs', 'LockHeld', 'lock held')),
        });

        await assertRejects(() => main(['libs'], _deps), ChatlogError);

        assertEquals(_calls.filter((name) => skipped.includes(name)), []);
      });
    }

    /** 削除できなかった残骸を 1 件返し、掃除の失敗で監査を中止させる依存の差し替え。 */
    const _sweepFailure: Partial<MainDeps> = {
      sweepArtifacts: () => Promise.resolve(['libs/a.mutation-001.ts']),
    };

    it('[Error] T-MUT-MT-15-01: sweepArtifacts が削除できなかったパス 1 件を返す → FailFast / SweepFailed の ChatlogError で reject し、message にそのパスを含む', async () => {
      const { deps: _deps } = makeMainDeps(_sweepFailure);

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertEquals({ kind: _error.kind, subindex: _error.subindex }, { kind: 'FailFast', subindex: 'SweepFailed' });
      assertStringIncludes(_error.message, 'libs/a.mutation-001.ts');
    });

    it('[Error] T-MUT-MT-15-03: sweepArtifacts が削除できなかったパス 1 件を返す → 中止後も hashSources・runBaseline を呼ばない', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps(_sweepFailure);

      await outcomeOf(main(['libs'], _deps));

      assertEquals(_calls.filter((name) => name === 'hashSources' || name === 'runBaseline'), []);
    });

    /**
     * 実行前のハッシュ取得で対象ソースが見つからず、監査を中止させる依存の差し替え。
     * 複数のテストで共有するため、呼び出し回数の状態を持たない fake にする (1 回目で中止するので以降は呼ばれない)。
     */
    const _hashFailure: Partial<MainDeps> = {
      hashSources: _throwing(new ChatlogError('FileDirNotFound', 'SourceNotFound', 'libs/a.ts')),
    };

    it('[Error] T-MUT-MT-16-01: 1 回目の hashSources が ChatlogError を投げる → その例外と同一のインスタンスで reject し、runBaseline を呼ばない', async () => {
      const _thrown = new ChatlogError('FileDirNotFound', 'SourceNotFound', 'libs/a.ts');
      const { deps: _deps, calls: _calls } = makeMainDeps({ hashSources: _throwing(_thrown) });

      const _error = await assertRejects(() => main(['libs'], _deps));

      assertStrictEquals(_error, _thrown);
      assertFalse(_calls.includes('runBaseline'));
    });

    /** レポートを標準出力へ書き出せず、監査を失敗させる依存の差し替え。 */
    const _reportWriteFailure: Partial<MainDeps> = {
      writeReport: () => {
        throw new Error('EPIPE');
      },
    };

    it('[Error] T-MUT-MT-17-01: writeReport が Error(EPIPE) を投げる → 0 でも 130 でもない結果になり、監査単位の失敗の ChatlogError で reject する', async () => {
      const _outcome = await outcomeOf(main(['libs'], makeMainDeps(_reportWriteFailure).deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);

      const _error = await assertRejects(() => main(['libs'], makeMainDeps(_reportWriteFailure).deps), ChatlogError);

      assertStringIncludes(_error.message, REPORT_WRITE_FAILURE_MESSAGE);
      assertStringIncludes(_error.message, 'EPIPE');
    });

    /** ベースラインのテストが失敗し、監査を中止させる依存の差し替え。 */
    const _baselineFailure: Partial<MainDeps> = {
      runBaseline: () => Promise.resolve({ kind: 'failed', reason: BASELINE_REASON_NONZERO_EXIT }),
    };

    /** ベースラインの失敗で中止したとき、呼ばれてはならない依存。 */
    const _baselineFailureCases: { id: string; skipped: string[]; reason: string }[] = [
      { id: 'T-MUT-MT-18-01', skipped: ['generateMutants', 'runMutants'], reason: '変異体を生成も実行もしない' },
      { id: 'T-MUT-MT-18-05', skipped: ['writeReport'], reason: 'レポートを構成しない' },
    ];

    for (const { id, skipped, reason } of _baselineFailureCases) {
      it(`[Error] ${id}: runBaseline が failed { reason } を返す → 中止後も ${skipped.join('・')} を呼ばない (${reason})`, async () => {
        const { deps: _deps, calls: _calls } = makeMainDeps(_baselineFailure);

        await outcomeOf(main(['libs'], _deps));

        assertEquals(_calls.filter((name) => skipped.includes(name)), []);
      });
    }

    it('[Error] T-MUT-MT-18-02: runBaseline が failed { reason } を返す → FailFast / BaselineFailed の ChatlogError で reject し、message に reason を含む', async () => {
      const { deps: _deps } = makeMainDeps(_baselineFailure);

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertEquals({ kind: _error.kind, subindex: _error.subindex }, { kind: 'FailFast', subindex: 'BaselineFailed' });
      assertStringIncludes(_error.message, BASELINE_REASON_NONZERO_EXIT);
    });

    it('[Error] T-MUT-MT-18-04: runBaseline が failed・2 回目の hashSources で 1 件の内容が変わる → hashSources を 2 回呼び、logger.error に BASELINE_ABORT_DRIFT_MESSAGE とそのパスを含む 1 行を出す', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        ..._baselineFailure,
        hashSources: driftingHashSources(),
      });
      const { loggerStub: _loggerStub } = await withLoggerStub(() => outcomeOf(main(['libs'], _deps)));

      assertEquals(_calls.filter((name) => name === 'hashSources'), ['hashSources', 'hashSources']);
      const _driftLines = _loggerStub.errorLogs.filter((line) => line.includes(BASELINE_ABORT_DRIFT_MESSAGE));
      assertEquals(_driftLines.length, 1, `errorLogs: ${_loggerStub.errorLogs.join('\n')}`);
      assertStringIncludes(_driftLines[0], 'libs/a.ts');
    });

    it('[Error] T-MUT-MT-19-01: 全工程成功・2 回目の hashSources で 1 件の内容が変わる・--strict なし → EXIT_CODE_FAILURE (1) を返す', async () => {
      const { deps: _deps } = makeMainDeps({ hashSources: driftingHashSources() });

      const _code = await main(['libs'], _deps);

      assertEquals(_code, EXIT_CODE_FAILURE);
    });

    it('[Error] T-MUT-MT-19-02: 全工程成功・2 回目の hashSources で libs/a.ts の内容が変わる → writeReport の drift 見出しの直下に libs/a.ts を 1 件だけ並べる', async () => {
      const _written: string[] = [];
      const { deps: _deps } = makeMainDeps({
        hashSources: driftingHashSources(),
        writeReport: (text) => void _written.push(text),
      });

      await outcomeOf(main(['libs'], _deps));

      assertEquals(driftSection(_written.join('\n')), ['libs/a.ts']);
    });

    /** ロックの取得後に監査を中止する経路。どの経路でもロックを 1 回だけ解放する。 */
    const _releaseOnAbortCases: { id: string; given: string; overrides: Partial<MainDeps> }[] = [
      { id: 'T-MUT-MT-15-02', given: 'sweepArtifacts が削除できなかったパス 1 件を返す', overrides: _sweepFailure },
      { id: 'T-MUT-MT-16-02', given: '1 回目の hashSources が ChatlogError を投げる', overrides: _hashFailure },
      { id: 'T-MUT-MT-17-02', given: 'writeReport が Error(EPIPE) を投げる', overrides: _reportWriteFailure },
      { id: 'T-MUT-MT-18-03', given: 'runBaseline が failed { reason } を返す', overrides: _baselineFailure },
    ];

    for (const { id, given, overrides } of _releaseOnAbortCases) {
      it(`[Error] ${id}: ${given} → 中止後も releaseLock を 1 回呼ぶ`, async () => {
        const { deps: _deps, calls: _calls } = makeMainDeps(overrides);

        await outcomeOf(main(['libs'], _deps));

        assertEquals(_calls.filter((name) => name === 'releaseLock'), ['releaseLock']);
      });
    }

    /** リポジトリルートの親ディレクトリ (リポジトリルートではない作業ディレクトリ)。 */
    const _parentOfRoot = dirname(REPO_ROOT);

    it('[Error] T-MUT-MT-30-01: cwd がリポジトリルートの親 → InvalidPath / WrongWorkingDirectory の ChatlogError で reject し、メッセージに注入した作業ディレクトリを含め、resolveTargets・loadAllowlist・acquireLock を呼ばない', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({ cwd: () => _parentOfRoot });

      const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertEquals(
        { kind: _error.kind, subindex: _error.subindex },
        { kind: 'InvalidPath', subindex: 'WrongWorkingDirectory' },
      );
      // _parentOfRoot は REPO_ROOT の部分文字列のため、前後を固定して注入値そのものを検証する
      assertStringIncludes(_error.message, `${WRONG_WORKING_DIRECTORY_MESSAGE}${_parentOfRoot} (期待:`);
      const _skipped = ['resolveTargets', 'loadAllowlist', 'acquireLock'];
      assertEquals(_calls.filter((name) => _skipped.includes(name)), []);
    });

    it('[Error] T-MUT-MT-30-04: cwd がリポジトリルートの親・argv が [] → 作業ディレクトリより引数を先に判定し MissingModule の ChatlogError で reject する', async () => {
      const { deps: _deps } = makeMainDeps({ cwd: () => _parentOfRoot });

      const _error = await assertRejects(() => main([], _deps), ChatlogError);

      assertEquals(_error.subindex, 'MissingModule');
    });

    it(
      '[Error] T-MUT-MT-30-05: cwd が REPO_ROOT のドライブ文字の大文字小文字だけを反転した文字列 → InvalidPath / WrongWorkingDirectory の ChatlogError で reject し、acquireLock を呼ばない',
      { ignore: !/^[A-Za-z]:/.test(REPO_ROOT) },
      async () => {
        const _drive = REPO_ROOT[0];
        const _flippedDrive = _drive === _drive.toUpperCase() ? _drive.toLowerCase() : _drive.toUpperCase();
        const _flipped = `${_flippedDrive}${REPO_ROOT.slice(1)}`;
        const { deps: _deps, calls: _calls } = makeMainDeps({ cwd: () => _flipped });

        const _error = await assertRejects(() => main(['libs'], _deps), ChatlogError);

        assertEquals(
          { kind: _error.kind, subindex: _error.subindex },
          { kind: 'InvalidPath', subindex: 'WrongWorkingDirectory' },
        );
        assertEquals(_calls.filter((name) => name === 'acquireLock'), []);
      },
    );

    it('[Error] T-MUT-MT-30-06: cwd を注入しない deps・Deno.cwd がリポジトリルートの親 → 既定の Deno.cwd を作業ディレクトリとして使い、InvalidPath / WrongWorkingDirectory の ChatlogError で reject し、acquireLock を呼ばない', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps();
      const { cwd: _omitted, ..._rest } = _deps;
      const _cwdStub = stub(Deno, 'cwd', () => _parentOfRoot);
      try {
        const _error = await assertRejects(() => main(['libs'], _rest), ChatlogError);

        assertEquals(
          { kind: _error.kind, subindex: _error.subindex },
          { kind: 'InvalidPath', subindex: 'WrongWorkingDirectory' },
        );
        assert(_cwdStub.calls.length >= 1);
        assertEquals(_calls.filter((name) => name === 'acquireLock'), []);
      } finally {
        _cwdStub.restore();
      }
    });
  });

  /** コードレビューの指摘から追加した検証。 */
  describe('レビュー由来の検証', () => {
    /** 起動時の掃除の対象範囲。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-MT-29-01: 既定の fake で監査 → sweepArtifacts を 1 回だけ、ソースのディレクトリと deno.jsonc の置き場所 (shallowDirs) を渡して呼ぶ', async () => {
        const _sweepArgs: unknown[][] = [];
        const { deps: _deps } = makeMainDeps({
          sweepArtifacts: (...args: unknown[]) => {
            _sweepArgs.push(args);
            return Promise.resolve([]);
          },
        });

        await main(['libs'], _deps);

        const _sourceDirs = [...new Set(FAKE_SOURCES.map((source) => join(REPO_ROOT, dirname(source))))];
        assertEquals(_sweepArgs, [[_sourceDirs, { shallowDirs: [dirname(DENO_CONFIG_PATH)] }]]);
      });
    });
  });
});
