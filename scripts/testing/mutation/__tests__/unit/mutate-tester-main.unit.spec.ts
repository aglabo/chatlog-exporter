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
  assertEquals,
  assertFalse,
  assertNotEquals,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
} from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../../mutate-tester.ts';

// ─── Helpers
import { dirname, join } from '@std/path';
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import {
  BASELINE_REASON_NONZERO_EXIT,
  DENO_CONFIG_PATH,
  REPO_ROOT,
  REPORT_NO_MUTANTS,
  REPORT_WRITE_FAILURE_MESSAGE,
} from '../../constants/mutation.constants.ts';
import { formatReport } from '../../report.ts';
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
import type { AllowlistEntry, MainDeps, Mutant, MutantResult } from '../../types/mutation.types.ts';

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

    it('[Normal] T-MUT-MT-10-04: survived 1 件・未許容・--strict あり → 0 でも 130 でもない値を返す', async () => {
      const { deps: _deps } = makeMainDeps(_survivedUnallowed);

      const _outcome = await outcomeOf(main(['libs', '--strict'], _deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);
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

    it('[Error] T-MUT-MT-15-01: sweepArtifacts が削除できなかったパス 1 件を返す → 0 でも 130 でもない結果になる', async () => {
      const { deps: _deps } = makeMainDeps(_sweepFailure);

      const _outcome = await outcomeOf(main(['libs'], _deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);
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

    it('[Error] T-MUT-MT-16-01: 1 回目の hashSources が ChatlogError を投げる → 0 でも 130 でもない結果になり、runBaseline を呼ばない', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps(_hashFailure);

      const _outcome = await outcomeOf(main(['libs'], _deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);
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

    it('[Error] T-MUT-MT-18-02: runBaseline が failed { reason } を返す → 0 でも 130 でもない結果になる', async () => {
      const { deps: _deps } = makeMainDeps(_baselineFailure);

      const _outcome = await outcomeOf(main(['libs'], _deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);
    });

    it('[Error] T-MUT-MT-18-04: runBaseline が failed・2 回目の hashSources で 1 件の内容が変わる → hashSources を 2 回呼び、そのパスを標準エラー出力へ列挙する', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        ..._baselineFailure,
        hashSources: driftingHashSources(),
      });
      const { loggerStub: _loggerStub } = await withLoggerStub(() => outcomeOf(main(['libs'], _deps)));

      assertEquals(_calls.filter((name) => name === 'hashSources'), ['hashSources', 'hashSources']);
      assertStringIncludes([..._loggerStub.errorLogs, ..._loggerStub.warnLogs].join('\n'), 'libs/a.ts');
    });

    it('[Error] T-MUT-MT-19-01: 全工程成功・2 回目の hashSources で 1 件の内容が変わる・--strict なし → 0 でも 130 でもない値を返す', async () => {
      const { deps: _deps } = makeMainDeps({ hashSources: driftingHashSources() });

      const _outcome = await outcomeOf(main(['libs'], _deps));

      assertNotEquals(_outcome, 0);
      assertNotEquals(_outcome, 130);
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
