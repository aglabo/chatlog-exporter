// src: scripts/testing/mutation/__tests__/unit/mutate-tester-sigint.unit.spec.ts
// @(#): mutate-tester の監査の SIGINT 中断と後始末のユニットテスト
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
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
} from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../../mutate-tester.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../../../../skills/_cle-libs/libs/io/logger.ts';
import {
  EXIT_CODE_INTERRUPTED,
  EXIT_CODE_OK,
  LOCK_RELEASE_WARNING,
  REPORT_HEADING_INTERRUPTED,
} from '../../constants/mutation.constants.ts';
import { formatReport } from '../../report.ts';
import {
  driftingHashSources,
  driftSection,
  FAKE_HASHES,
  leftoversSection,
  makeMainDeps,
  mutant,
  outcomeOf,
  withLoggerStub,
} from '../helpers/main-fakes.ts';

// types
import type { AllowlistEntry, MainDeps, MutationRunReport } from '../../types/mutation.types.ts';
import type { MainFakes } from '../helpers/main-fakes.ts';

// ─── Internal Helpers

// types

/**
 * 実行中に SIGINT を受けさせる工程。
 *
 * `hashSources` は 1 回目 (実行前のハッシュ記録)、`driftCheck` は 2 回目 (drift 検査) の `hashSources` を指す。
 */
type _InterruptibleStep = 'sweepArtifacts' | 'hashSources' | 'driftCheck' | 'runBaseline' | 'runMutants';

/** `_interruptDuring` の戻り値。 */
type _InterruptDuringFakes = MainFakes & {
  /** SIGINT を受けたすべての工程の呼び出しが最後まで進んで resolve したか。 */
  stepCompleted: () => boolean;
  /** `runBaseline` が受け取った `options.signal` (`runBaseline` が呼ばれていなければ `undefined`)。 */
  baselineSignal: () => AbortSignal | undefined;
  /** `runMutants` が受け取った `options.signal` (`runMutants` が呼ばれていなければ `undefined`)。 */
  mutantsSignal: () => AbortSignal | undefined;
};

// functions

/**
 * 呼び出し記録の中で工程名が最初に現れる位置を返す。
 *
 * 記録に無い工程は `-1` で位置比較をすり抜けるため、その場合はテストを失敗させる。
 *
 * @param calls - fake が記録した工程名の列
 * @param name - 位置を求める工程名
 * @returns `calls` で `name` が最初に現れる添字
 */
const _indexOf = (calls: readonly string[], name: string): number => {
  const _index = calls.indexOf(name);
  assert(_index >= 0, `${name} が呼ばれていない: calls: ${calls.join(', ')}`);
  return _index;
};

/**
 * 呼び出し記録から、指定した工程ごとの呼び出し回数を数える。
 *
 * @param calls - fake が記録した工程名の列
 * @param names - 回数を数える工程名
 * @returns 工程名 → 呼び出し回数
 */
const _countsOf = (calls: readonly string[], names: readonly string[]): Record<string, number> =>
  Object.fromEntries(names.map((name) => [name, calls.filter((call) => call === name).length]));

/**
 * 指定した工程の実行中に SIGINT の handler を呼ぶ fake 一式を作る。
 *
 * 工程を複数指定すると、それぞれの実行中に handler を呼ぶ (2 回目以降の SIGINT を再現する)。
 * 各呼び出しは handler を呼んだあとタイマー 1 周分 `await` してから完了数を数えて resolve する
 * (工程を待たずに中断する `main` は、数え終わる前に終了する)。
 * handler・完了数・呼び出し回数を保持する状態を持つため、テストごとに新しく作る (テスト間で共有しない)。
 *
 * @param steps - SIGINT を受けさせる工程 (1 つ、または複数)
 * @param overrides - 指定した工程以外に既定の fake から差し替える依存
 * @returns 指定した工程の実行中に SIGINT を受ける fake の一式と完了の参照関数
 */
const _interruptDuring = (
  steps: _InterruptibleStep | readonly _InterruptibleStep[],
  overrides: Partial<MainDeps> = {},
): _InterruptDuringFakes => {
  const _steps: readonly _InterruptibleStep[] = typeof steps === 'string' ? [steps] : steps;
  let _completedCount = 0;
  let _baselineSignal: AbortSignal | undefined;
  let _mutantsSignal: AbortSignal | undefined;
  const _interrupt = async (): Promise<void> => {
    _fakes.sigint();
    await new Promise((resolve) => setTimeout(resolve, 0));
    _completedCount++;
  };
  /** `calls` に含まれる回目 (1 始まり) の呼び出しでだけ SIGINT を挟んでから `fn` に委譲する関数を作る。 */
  const _interruptingAt = <R>(calls: readonly number[], fn: () => Promise<R>): () => Promise<R> => {
    let _count = 0;
    return async (): Promise<R> => {
      if (calls.includes(++_count)) {
        await _interrupt();
      }
      return fn();
    };
  };
  const _hashSources = (): Partial<MainDeps> => ({
    hashSources: _interruptingAt(
      [..._steps.includes('hashSources') ? [1] : [], ..._steps.includes('driftCheck') ? [2] : []],
      () => Promise.resolve({ ...FAKE_HASHES }),
    ),
  });
  const _stepFakes: Record<_InterruptibleStep, () => Partial<MainDeps>> = {
    sweepArtifacts: () => ({ sweepArtifacts: _interruptingAt([1], () => Promise.resolve([])) }),
    hashSources: _hashSources,
    driftCheck: _hashSources,
    runBaseline: () => ({
      runBaseline: async (_runner, _args, options) => {
        _baselineSignal = options.signal;
        await _interrupt();
        return { kind: 'interrupted' };
      },
    }),
    runMutants: () => ({
      runMutants: async (mutants, options) => {
        _mutantsSignal = options.signal;
        await _interrupt();
        return { results: [{ mutant: mutants[0], status: 'killed' }], leftovers: [], interrupted: true };
      },
    }),
  };
  const _fakes: MainFakes = makeMainDeps(Object.assign({ ...overrides }, ..._steps.map((step) => _stepFakes[step]())));
  return {
    ..._fakes,
    stepCompleted: () => _completedCount === _steps.length,
    baselineSignal: () => _baselineSignal,
    mutantsSignal: () => _mutantsSignal,
  };
};

/**
 * `writeReport` に渡されたレポートを記録する fake を作る。
 *
 * 記録配列を持つため、テストごとに新しく作る (テスト間で共有しない)。
 *
 * @returns `writeReport` の fake・記録したレポートの配列・記録を改行で連結した本文を返す関数
 */
const _reportWriter = () => {
  const _written: string[] = [];
  return {
    writeReport: (text: string): void => void _written.push(text),
    written: _written,
    reportText: (): string => _written.join('\n'),
  };
};

/**
 * 中断したときに `main` が書き出すべきレポートを、実物の `formatReport` で組み立てる。
 *
 * 許容リストの照合結果・残骸・監査の失敗は空とする。
 *
 * @param partial - 生成件数・判定・drift (省略時はいずれも 0 件)
 * @returns 中断を明示する期待レポート
 */
const _expectedInterruptedReport = (
  partial: Partial<Pick<MutationRunReport, 'generatedCount' | 'results' | 'drift'>> = {},
): string =>
  formatReport({
    generatedCount: 0,
    results: [],
    drift: [],
    ...partial,
    match: { allowed: [], unallowed: [], stale: [] },
    leftovers: [],
    interrupted: true,
    auditFailures: [],
  });

/**
 * 解放に失敗したときの本番の `releaseLock` の契約をなぞる fake。
 *
 * `LOCK_RELEASE_WARNING` を含む警告を `logger.warn` で 1 回出して resolve する (例外は投げない)。
 *
 * @returns 解放失敗を警告だけで報告する `releaseLock`
 */
const _warningReleaseLock = (): MainDeps['releaseLock'] => () => {
  logger.warn(`${LOCK_RELEASE_WARNING}permission denied`);
  return Promise.resolve();
};

/** 後始末で削除できなかった残骸として `runMutants` の fake が返すパス。 */
const _LEFTOVER = 'src/a.mutation-001.ts';

/**
 * 先頭の変異体を killed と判定し、削除できなかった残骸 `_LEFTOVER` を 1 件返す `runMutants` の fake。
 *
 * @param mutants - `main` が渡した変異体
 * @returns killed 1 件・残骸 1 件・中断なしの実行結果
 */
const _leftoverRunMutants: MainDeps['runMutants'] = (mutants) =>
  Promise.resolve({
    results: [{ mutant: mutants[0], status: 'killed' }],
    leftovers: [_LEFTOVER],
    interrupted: false,
  });

/**
 * 解除関数の呼び出し回数を数える `signals` の fake を作る。
 *
 * handler を保持するため、`sigint()` で任意の時点の SIGINT を再現できる。
 * 呼び出し回数と handler を状態として持つため、テストごとに新しく作る (テスト間で共有しない)。
 *
 * @returns `signals` の fake・解除関数の呼び出し回数・SIGINT の再現関数
 */
const _countingSignals = (): {
  signals: MainDeps['signals'];
  unregisterCount: () => number;
  sigint: () => void;
} => {
  const _store: { handler?: () => void; unregistered: number } = { unregistered: 0 };
  return {
    signals: {
      onInterrupt: (handler) => {
        _store.handler = handler;
        return () => {
          _store.unregistered++;
          _store.handler = undefined;
        };
      },
    },
    unregisterCount: () => _store.unregistered,
    sigint: () => _store.handler?.(),
  };
};

// cases

/** ベースライン中の中断で、工程ごとの呼び出し回数を検証するケース。 */
const _baselineInterruptCallCases: readonly {
  id: string;
  outcome: string;
  /** 工程名 → 期待する呼び出し回数。 */
  expectedCounts: Record<string, number>;
}[] = [
  {
    id: 'T-MUT-MT-21-03',
    outcome: 'generateMutants も runMutants も呼ばない',
    expectedCounts: { generateMutants: 0, runMutants: 0 },
  },
  { id: 'T-MUT-MT-21-04', outcome: 'drift 検査を行い、hashSources を 2 回呼ぶ', expectedCounts: { hashSources: 2 } },
  { id: 'T-MUT-MT-21-06', outcome: 'releaseLock を 1 回呼ぶ', expectedCounts: { releaseLock: 1 } },
];

/** 終了の経路ごとに、SIGINT の受信の解除が 1 回だけ行われることを検証するケース。 */
const _unregisterCases: readonly {
  id: string;
  path: string;
  outcome: string;
  /**
   * 既定の fake から差し替える依存を作る (`signals` は除く)。
   *
   * @param sigint - テストごとに作った `signals` の fake が保持する handler を呼ぶ関数
   */
  overridesOf: (sigint: () => void) => Partial<MainDeps>;
  /** `outcomeOf(main(...))` の期待値。 */
  expected: number | 'rejected';
}[] = [
  {
    id: 'T-MUT-MT-28-01',
    path: 'すべての fake が成功し',
    outcome: '0 を返す',
    overridesOf: () => ({}),
    expected: EXIT_CODE_OK,
  },
  {
    id: 'T-MUT-MT-28-02',
    path: 'runMutants が想定外の Error を投げ',
    outcome: 'reject する',
    overridesOf: () => ({ runMutants: () => Promise.reject(new Error('unexpected')) }),
    expected: 'rejected',
  },
  {
    id: 'T-MUT-MT-28-03',
    path: 'runMutants の実行中に SIGINT して interrupted: true を返し',
    outcome: '130 を返す',
    overridesOf: (sigint) => ({
      runMutants: (mutants) => {
        sigint();
        return Promise.resolve({
          results: [{ mutant: mutants[0], status: 'killed' }],
          leftovers: [],
          interrupted: true,
        });
      },
    }),
    expected: EXIT_CODE_INTERRUPTED,
  },
];

// ─── Tests

/**
 * `main` の SIGINT 中断のユニットテストスイート。
 *
 * 注入した fake の中で SIGINT の handler を呼び、中断時の工程の打ち切り・後始末・終了コードを検証する。
 *
 * @see main
 */
describe('main', () => {
  /** 監査の途中で SIGINT を受けるケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-MUT-MT-20-01: 1 回目の hashSources の実行中に SIGINT → 130 を返す', async () => {
      const { deps: _deps } = _interruptDuring('hashSources');

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-20-02: 1 回目の hashSources の実行中に SIGINT → ハッシュ記録を終え、runBaseline を呼ばない', async () => {
      const { deps: _deps, calls: _calls, stepCompleted: _stepCompleted } = _interruptDuring('hashSources');

      await main(['libs'], _deps);

      assertStrictEquals(_stepCompleted(), true);
      assertFalse(_calls.includes('runBaseline'));
    });

    it('[Edge] T-MUT-MT-20-03: 1 回目の hashSources の実行中に SIGINT → drift 検査を省き、hashSources は 1 回だけ', async () => {
      const { deps: _deps, calls: _calls } = _interruptDuring('hashSources');

      await main(['libs'], _deps);

      assertStrictEquals(_calls.filter((name) => name === 'hashSources').length, 1);
    });

    it('[Edge] T-MUT-MT-20-04: 1 回目の hashSources の実行中に SIGINT → 判定 0 件・drift なしの中断レポートを writeReport へ 1 回渡す', async () => {
      const { writeReport: _writeReport, written: _written } = _reportWriter();
      const { deps: _deps } = _interruptDuring('hashSources', { writeReport: _writeReport });

      await main(['libs'], _deps);

      assertEquals(_written, [_expectedInterruptedReport()]);
      assertStringIncludes(_written[0], REPORT_HEADING_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-20-05: 1 回目の hashSources の実行中に SIGINT → releaseLock を 1 回呼ぶ', async () => {
      const { deps: _deps, calls: _calls } = _interruptDuring('hashSources');

      await main(['libs'], _deps);

      assertStrictEquals(_calls.filter((name) => name === 'releaseLock').length, 1);
    });

    it('[Edge] T-MUT-MT-20-06: sweepArtifacts の実行中に SIGINT → 掃除を終えてから中断し、ハッシュもベースラインも行わず 130 を返す', async () => {
      const { deps: _deps, calls: _calls, stepCompleted: _stepCompleted } = _interruptDuring('sweepArtifacts');

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_stepCompleted(), true);
      assertFalse(_calls.includes('runBaseline'));
      assertFalse(_calls.includes('hashSources'));
      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-21-01: runBaseline の実行中に SIGINT し interrupted が返る → 失敗ではなく 130 を返す', async () => {
      const { deps: _deps } = _interruptDuring('runBaseline');

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-21-02: runBaseline の実行中に SIGINT → runBaseline に渡した signal が中止される', async () => {
      const { deps: _deps, baselineSignal: _baselineSignal } = _interruptDuring('runBaseline');

      await main(['libs'], _deps);

      assertStrictEquals(_baselineSignal()?.aborted, true);
    });

    for (const { id, outcome, expectedCounts } of _baselineInterruptCallCases) {
      it(`[Edge] ${id}: runBaseline の実行中に SIGINT し interrupted が返る → ${outcome}`, async () => {
        const { deps: _deps, calls: _calls } = _interruptDuring('runBaseline');

        await main(['libs'], _deps);

        assertEquals(_countsOf(_calls, Object.keys(expectedCounts)), expectedCounts);
      });
    }

    it('[Edge] T-MUT-MT-21-05: runBaseline の実行中に SIGINT し interrupted が返る → 判定 0 件・drift 入りの中断レポートを writeReport へ 1 回渡す', async () => {
      const { writeReport: _writeReport, written: _written } = _reportWriter();
      const { deps: _deps } = _interruptDuring('runBaseline', {
        hashSources: driftingHashSources(),
        writeReport: _writeReport,
      });

      await main(['libs'], _deps);

      assertEquals(_written, [_expectedInterruptedReport({ drift: ['libs/a.ts'] })]);
      assertStringIncludes(_written[0], REPORT_HEADING_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-22-01: runMutants の実行中に SIGINT し interrupted と判定 1 件が返る → 130 を返す', async () => {
      const { deps: _deps } = _interruptDuring('runMutants');

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-22-02: runMutants の実行中に SIGINT → runMutants に渡した signal が中止される', async () => {
      const { deps: _deps, mutantsSignal: _mutantsSignal } = _interruptDuring('runMutants');

      await main(['libs'], _deps);

      assertStrictEquals(_mutantsSignal()?.aborted, true);
    });

    it('[Edge] T-MUT-MT-22-03: runMutants の実行中に SIGINT・2 回目の hashSources で libs/a.ts の内容が変わる → writeReport の drift 見出しの直下に libs/a.ts を 1 件だけ並べる', async () => {
      const { writeReport: _writeReport, reportText: _reportText } = _reportWriter();
      const { deps: _deps } = _interruptDuring('runMutants', {
        hashSources: driftingHashSources(),
        writeReport: _writeReport,
      });

      await main(['libs'], _deps);

      assertEquals(driftSection(_reportText()), ['libs/a.ts']);
    });

    it('[Edge] T-MUT-MT-22-04: runMutants の実行中に SIGINT し interrupted と killed 1 件が返る → 中断を明示し killed 1 件を含むレポートを writeReport へ 1 回渡す', async () => {
      const { writeReport: _writeReport, written: _written } = _reportWriter();
      const { deps: _deps } = _interruptDuring('runMutants', { writeReport: _writeReport });

      await main(['libs'], _deps);

      const _expected = _expectedInterruptedReport({
        generatedCount: 1,
        results: [{ mutant: mutant('libs/a.ts', 1), status: 'killed' }],
      });
      assertEquals(_written, [_expected]);
      assertStringIncludes(_written[0], REPORT_HEADING_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-22-05: runMutants の実行中に SIGINT し interrupted が返る → writeReport の後に releaseLock を 1 回だけ呼ぶ', async () => {
      const { deps: _deps, calls: _calls } = _interruptDuring('runMutants');

      await main(['libs'], _deps);

      assertEquals(_calls.filter((name) => name === 'writeReport' || name === 'releaseLock'), [
        'writeReport',
        'releaseLock',
      ]);
    });

    it('[Edge] T-MUT-MT-22-06: runMutants の実行中に SIGINT・2 回目の hashSources で libs/a.ts の内容が変わる → drift より中断を優先して 130 を返す', async () => {
      const { deps: _deps } = _interruptDuring('runMutants', { hashSources: driftingHashSources() });

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-22-07: 変異体 3 件を生成し runMutants の実行中に SIGINT・判定 1 件が返る → matchAllowlist に生成された 3 件すべてを渡す', async () => {
      const _generated = [mutant('libs/a.ts', 1), mutant('libs/a.ts', 2), mutant('libs/a.ts', 3)];
      const _matched: (readonly unknown[])[] = [];
      const { deps: _deps } = _interruptDuring('runMutants', {
        generateMutants: () => [..._generated],
        matchAllowlist: (mutants) => {
          _matched.push([...mutants]);
          return { allowed: [], unallowed: [], stale: [] };
        },
      });

      await main(['libs'], _deps);

      assertEquals(_matched, [_generated]);
    });

    it('[Edge] T-MUT-MT-22-08: runMutants の実行中に SIGINT・matchAllowlist が古いエントリ 1 件を返す → 中断を明示し古いエントリの file と lineText を含むレポートを writeReport へ渡す', async () => {
      const { writeReport: _writeReport, reportText: _reportText } = _reportWriter();
      const _stale: AllowlistEntry = {
        file: 'libs/old.ts',
        lineText: 'if (a < b) {',
        op: 'relational',
        before: '<',
        after: '<=',
        occurrence: 1,
        reason: 'equivalent',
      };
      const { deps: _deps } = _interruptDuring('runMutants', {
        matchAllowlist: () => ({ allowed: [], unallowed: [], stale: [_stale] }),
        writeReport: _writeReport,
      });

      await main(['libs'], _deps);

      const _report = _reportText();
      assertStringIncludes(_report, REPORT_HEADING_INTERRUPTED);
      assertStringIncludes(_report, 'libs/old.ts');
      assertStringIncludes(_report, 'if (a < b) {');
    });

    it('[Edge] T-MUT-MT-24-01: runMutants の実行中と 2 回目の hashSources の実行中に SIGINT → hashSources が 2 回とも完了し、writeReport と releaseLock を 1 回ずつ呼び 130 を返す', async () => {
      const { deps: _deps, calls: _calls, stepCompleted: _stepCompleted } = _interruptDuring([
        'runMutants',
        'driftCheck',
      ]);

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_stepCompleted(), true);
      assertEquals(_countsOf(_calls, ['hashSources', 'writeReport', 'releaseLock']), {
        hashSources: 2,
        writeReport: 1,
        releaseLock: 1,
      });
      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-29-02: generateMutants の実行中に SIGINT し変異体 0 件 → 中断を明示したレポートを書き出し 130 を返す', async () => {
      const { signals: _signals, sigint: _sigint } = _countingSignals();
      const { writeReport: _writeReport, reportText: _reportText } = _reportWriter();
      const { deps: _deps } = makeMainDeps({
        signals: _signals,
        writeReport: _writeReport,
        generateMutants: () => {
          _sigint();
          return [];
        },
      });

      const _code = await main(['libs'], _deps);

      assertStringIncludes(_reportText(), REPORT_HEADING_INTERRUPTED);
      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-29-03: runMutants が interrupted: false を返し、最初の SIGINT が 2 回目の hashSources の実行中に届く → 130 を返す', async () => {
      const { deps: _deps } = _interruptDuring('driftCheck');

      const _code = await main(['libs'], _deps);

      assertStrictEquals(_code, EXIT_CODE_INTERRUPTED);
    });

    it('[Edge] T-MUT-MT-23-01: すべての fake が成功する → signals.onInterrupt を acquireLock の後、sweepArtifacts の前に呼ぶ', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps();

      await main(['libs'], _deps);

      const _registeredAt = _indexOf(_calls, 'signals.onInterrupt');
      assert(_registeredAt > _indexOf(_calls, 'acquireLock'), `calls: ${_calls.join(', ')}`);
      assert(_registeredAt < _indexOf(_calls, 'sweepArtifacts'), `calls: ${_calls.join(', ')}`);
    });

    it('[Edge] T-MUT-MT-23-02: acquireLock が ChatlogError を投げる → reject 後も signals.onInterrupt を呼ばない (SIGINT の受信を始めない)', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        acquireLock: () => Promise.reject(new ChatlogError('InvalidArgs', 'LockHeld', 'lock held')),
      });

      await assertRejects(() => main(['libs'], _deps), ChatlogError);

      assertFalse(_calls.includes('signals.onInterrupt'), `calls: ${_calls.join(', ')}`);
    });

    it('[Edge] T-MUT-MT-25-01: 全工程成功・releaseLock が解放失敗を警告だけで報告する → 0 を返す', async () => {
      const { deps: _deps } = makeMainDeps({ releaseLock: _warningReleaseLock() });
      const { result: _outcome } = await withLoggerStub(() => outcomeOf(main(['libs'], _deps)));

      assertStrictEquals(_outcome, EXIT_CODE_OK);
    });

    it('[Edge] T-MUT-MT-25-02: 全工程成功・releaseLock が解放失敗を警告だけで報告する → logger の警告は 1 件だけで、writeReport の本文には含まない', async () => {
      const { writeReport: _writeReport, written: _written, reportText: _reportText } = _reportWriter();
      const { deps: _deps } = makeMainDeps({ releaseLock: _warningReleaseLock(), writeReport: _writeReport });
      const { loggerStub: _loggerStub } = await withLoggerStub(() => main(['libs'], _deps));

      assertStrictEquals(_loggerStub.warnLogs.length, 1, `warn: ${_loggerStub.warnLogs.join(' | ')}`);
      assertStringIncludes(_loggerStub.warnLogs[0], LOCK_RELEASE_WARNING);
      assertStrictEquals(_written.length, 1);
      assertFalse(_reportText().includes(LOCK_RELEASE_WARNING), `report: ${_reportText()}`);
    });

    it('[Edge] T-MUT-MT-26-01: runMutants が killed 1 件と削除できなかった残骸 1 件を返す → 終了コードは変えず 0 を返す', async () => {
      const { deps: _deps } = makeMainDeps({ runMutants: _leftoverRunMutants });

      const _outcome = await outcomeOf(main(['libs'], _deps));

      assertStrictEquals(_outcome, EXIT_CODE_OK);
    });

    it('[Edge] T-MUT-MT-26-02: runMutants が削除できなかった残骸 src/a.mutation-001.ts を返す → writeReport の残骸節に src/a.mutation-001.ts だけを並べる', async () => {
      const { writeReport: _writeReport, reportText: _reportText } = _reportWriter();
      const { deps: _deps } = makeMainDeps({ runMutants: _leftoverRunMutants, writeReport: _writeReport });

      await main(['libs'], _deps);

      assertEquals(leftoversSection(_reportText()), [_LEFTOVER], `report: ${_reportText()}`);
    });

    it('[Edge] T-MUT-MT-27-01: runMutants が想定外の Error を投げる → reject を捕捉した後、releaseLock を 1 回呼んでいる', async () => {
      const { deps: _deps, calls: _calls } = makeMainDeps({
        runMutants: () => Promise.reject(new Error('unexpected')),
      });

      await assertRejects(() => main(['libs'], _deps));

      assertEquals(_countsOf(_calls, ['releaseLock']), { releaseLock: 1 }, `calls: ${_calls.join(', ')}`);
    });

    it('[Edge] T-MUT-MT-27-02: runMutants が想定外の Error を投げる → main はその Error と同一のインスタンスで reject する (0 や 130 で resolve しない)', async () => {
      const _unexpected = new Error('unexpected');
      const { deps: _deps } = makeMainDeps({ runMutants: () => Promise.reject(_unexpected) });

      const _error = await assertRejects(() => main(['libs'], _deps));

      assertStrictEquals(_error, _unexpected);
    });

    for (const { id, path, outcome, overridesOf, expected } of _unregisterCases) {
      it(`[Edge] ${id}: ${path}、signals.onInterrupt が記録付きの解除関数を返す → 解除関数を 1 回呼び、${outcome}`, async () => {
        const { signals: _signals, unregisterCount: _unregisterCount, sigint: _sigint } = _countingSignals();
        const { deps: _deps } = makeMainDeps({ signals: _signals, ...overridesOf(_sigint) });

        const _outcome = await outcomeOf(main(['libs'], _deps));

        assertStrictEquals(_unregisterCount(), 1);
        assertStrictEquals(_outcome, expected);
      });
    }
  });
});
