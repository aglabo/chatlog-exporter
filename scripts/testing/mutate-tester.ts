// src: scripts/testing/mutate-tester.ts
// @(#): 変異テストの CLI エントリ (引数解析)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { dirname, join } from '@std/path';

import { ChatlogError } from '../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../skills/_cle-libs/libs/io/logger.ts';
import { parseOptions } from '../../skills/_cle-libs/libs/io/parse-args.ts';
import type { ArgSchema, ArgValue } from '../../skills/_cle-libs/types/args-schema.types.ts';
import { loadAllowlist, matchAllowlist } from './mutation/allowlist.ts';
import { runBaseline } from './mutation/baseline.ts';
import {
  BASELINE_ABORT_DRIFT_MESSAGE,
  DEFAULT_LOCK_PATH,
  DEFAULT_TIMEOUT_SEC,
  DENO_CONFIG_PATH,
  EXIT_CODE_INTERRUPTED,
  INVALID_TIMEOUT_MESSAGE,
  MISSING_MODULE_MESSAGE,
  MUTATE_MODULES,
  MUTATE_MODULES_NOTE,
  MUTATION_TEST_PERMISSIONS,
  REPO_ROOT,
  REPORT_WRITE_FAILURE_MESSAGE,
  SWEEP_FAILURE_MESSAGE,
  UNKNOWN_MODULE_MESSAGE,
} from './mutation/constants/mutation.constants.ts';
import { generateMutants } from './mutation/generate-mutants.ts';
import { decideExitCode, formatReport } from './mutation/report.ts';
import { resolveTargets } from './mutation/resolve-targets.ts';
import { runDenoTest } from './mutation/run-deno-test.ts';
import { runMutants } from './mutation/run-mutants.ts';
import { acquireLock, detectDrift, hashSources, releaseLock, sweepArtifacts } from './mutation/run-safety.ts';
import type {
  AllowlistMatch,
  BaselineResult,
  MainDeps,
  Mutant,
  MutateArgs,
  MutateModule,
  MutationRunReport,
  RunMutantsResult,
  SignalsProvider,
} from './mutation/types/mutation.types.ts';

export type { MainDeps, MutateArgs } from './mutation/types/mutation.types.ts';

/** `parseOptions` が解釈するオプションのフィールド。 */
type _MutateOptionFields = {
  /** `--strict` の指定有無。 */
  strict: boolean;
  /** `--timeout` の生の値。整数の検査は `parseOptions` に任せず自前で行う (`integer` 型は `30s` を受理するため)。 */
  timeout: string;
};

/** mutate-tester のオプションのスキーマ。 */
const _MUTATE_ARG_SCHEMA: ArgSchema<_MutateOptionFields> = [
  { option: '--strict', field: 'strict', type: 'flag' },
  { option: '--timeout', field: 'timeout', type: 'string' },
];

/**
 * 値が変異テストの許可するモジュール名かを判定する。
 *
 * @param value - 位置引数のモジュール名
 * @returns 許可リストに含まれるとき `true`
 */
const _isMutateModule = (value: string): value is MutateModule => MUTATE_MODULES.some((m) => m === value);

/**
 * モジュール名の引数エラーの詳細に許可値の一覧を添える。
 *
 * @param detail - 例外の詳細
 * @returns 許可値の一覧を後ろに添えた詳細
 */
const _withMutateModules = (detail: string): string => `${detail} (${MUTATE_MODULES_NOTE})`;

/**
 * 位置引数のモジュール名を検証して返す。
 *
 * @param value - 位置引数のモジュール名 (欠落時は `undefined`)
 * @returns 許可されたモジュール名
 * @throws {ChatlogError} 欠落しているとき (`InvalidArgs` / `MissingModule`)
 * @throws {ChatlogError} 許可リストに無いとき (`InvalidArgs` / `UnknownModule`)
 */
const _toMutateModule = (value: string | undefined): MutateModule => {
  if (value === undefined) {
    throw new ChatlogError('InvalidArgs', 'MissingModule', _withMutateModules(MISSING_MODULE_MESSAGE));
  }
  if (!_isMutateModule(value)) {
    throw new ChatlogError('InvalidArgs', 'UnknownModule', _withMutateModules(`${UNKNOWN_MODULE_MESSAGE}${value}`));
  }
  return value;
};

/** 符号・小数点・単位を含まない数字だけの並び。 */
const _DIGITS_ONLY = /^[0-9]+$/;

/**
 * `--timeout` の生の値が正の整数かを判定する。
 *
 * @param raw - `--timeout` の生の値
 * @returns 数字だけで構成され、かつ 0 より大きいとき `true`
 */
const _isPositiveInteger = (raw: string): boolean => _DIGITS_ONLY.test(raw) && Number(raw) > 0;

/**
 * `--timeout` の値を検証して秒数に変換する。
 *
 * @param value - `--timeout` の生の値 (スキーマ上は文字列。省略時は `undefined`)
 * @returns 制限時間 (秒)。省略時は既定値
 * @throws {ChatlogError} 正の整数でないとき (`InvalidArgs` / `InvalidTimeout`)
 */
const _toTimeoutSec = (value: ArgValue | undefined): number => {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_SEC;
  }
  const _raw = String(value);
  if (!_isPositiveInteger(_raw)) {
    throw new ChatlogError('InvalidArgs', 'InvalidTimeout', `${INVALID_TIMEOUT_MESSAGE}${_raw}`);
  }
  return Number(_raw);
};

/**
 * mutate-tester の CLI 引数から実行条件を確定する (report-cli R-604)。
 *
 * @param argv - CLI 引数 (`<module> [--strict] [--timeout <sec>]`)
 * @returns 対象モジュール・`--strict`・制限時間
 * @throws {ChatlogError} 引数が不正なとき (`InvalidArgs`)
 */
export const parseMutateArgs = (argv: string[]): MutateArgs => {
  const { config: _config, positionals: _positionals } = parseOptions<_MutateOptionFields>(argv, _MUTATE_ARG_SCHEMA);
  // モジュールの検査 (R-601 / R-602) を `--timeout` の検査 (R-603) より先に行う
  const _module = _toMutateModule(_positionals[0]);
  const _timeoutSec = _toTimeoutSec(_config.timeout);
  return { module: _module, strict: _config.strict === true, timeoutSec: _timeoutSec };
};

/** SIGINT の受信を `Deno.addSignalListener` で登録する production の提供元。 */
const _denoSignals: SignalsProvider = {
  onInterrupt: (handler) => {
    Deno.addSignalListener('SIGINT', handler);
    return () => Deno.removeSignalListener('SIGINT', handler);
  },
};

/**
 * リポジトリルート相対のソースを読む production の `readSource`。
 *
 * @param path - リポジトリルート相対のソースのパス
 * @returns ソースの内容
 */
const _readRepoSource = (path: string): Promise<string> => Deno.readTextFile(join(REPO_ROOT, path));

/**
 * レポートを標準出力へ書き出す production の `writeReport`。
 *
 * @param text - レポートの本文
 */
const _writeStdout = (text: string): void => logger.log(text);

/**
 * 対象ソースを順に読み、ソース順に並べた全変異体を生成する。
 *
 * @param sources - リポジトリルート相対のソースのパス
 * @param readSource - ソースを読む依存
 * @param generate - ソース 1 件から変異体を生成する依存
 * @returns ソース順に連結した変異体の並び
 */
const _generateAllMutants = async (
  sources: readonly string[],
  readSource: MainDeps['readSource'],
  generate: MainDeps['generateMutants'],
): Promise<Mutant[]> => {
  const _texts = await Promise.all(sources.map(readSource));
  return sources.flatMap((source, i) => generate(_texts[i], source));
};

/**
 * ソース集合から、残骸を掃除するディレクトリ (リポジトリルート基準の絶対パス) を重複なく導く。
 *
 * @param sources - リポジトリルート相対のソースのパス
 * @returns 掃除するディレクトリの並び
 */
const _sweepDirsOf = (sources: readonly string[]): string[] => [
  ...new Set(sources.map((source) => join(REPO_ROOT, dirname(source)))),
];

/**
 * 監査単位の失敗を表す例外を作る (execution DD-14)。
 *
 * @param subindex - 失敗した工程を示す副分類
 * @param reason - 失敗の理由
 * @returns 監査を中止させる例外
 */
const _auditFailure = (subindex: string, reason: string): ChatlogError =>
  new ChatlogError('FailFast', subindex, reason);

/**
 * 起動時の残骸掃除で削除できなかったファイルが無いことを確かめる (execution DD-14)。
 *
 * @param leftovers - `sweepArtifacts` が削除できなかったパス
 * @throws {ChatlogError} 1 件以上あるとき (`FailFast` / `SweepFailed`)
 */
const _assertSwept = (leftovers: readonly string[]): void => {
  if (leftovers.length > 0) {
    throw _auditFailure('SweepFailed', `${SWEEP_FAILURE_MESSAGE}${leftovers.join(', ')}`);
  }
};

/**
 * ベースラインのテストが失敗していないことを確かめる (index R-007 / execution R-208)。
 *
 * 失敗したときは中止する前に drift 検査を行い、drift があれば標準エラー出力へ列挙する。
 *
 * @param baseline - ベースラインの実行結果
 * @param checkDrift - 実行前後で内容が変わった元ソースのパスを返す drift 検査
 * @throws {ChatlogError} ベースラインが失敗したとき (`FailFast` / `BaselineFailed`)
 */
const _assertBaselinePassed = async (
  baseline: BaselineResult,
  checkDrift: () => Promise<string[]>,
): Promise<void> => {
  if (baseline.kind !== 'failed') {
    return;
  }
  const _drift = await checkDrift();
  if (_drift.length > 0) {
    logger.error(`${BASELINE_ABORT_DRIFT_MESSAGE}${_drift.join(', ')}`);
  }
  throw _auditFailure('BaselineFailed', baseline.reason);
};

/**
 * レポートを書き出し、書き出しの失敗を監査単位の失敗に変える (execution DD-14 / report-cli R-615)。
 *
 * @param writeReport - レポートを書き出す関数
 * @param text - 書き出すレポート
 * @throws {ChatlogError} 書き出しに失敗したとき (`FailFast` / `ReportWriteFailed`)
 */
const _writeReportOrFail = async (writeReport: MainDeps['writeReport'], text: string): Promise<void> => {
  try {
    await writeReport(text);
  } catch (e) {
    const _reason = e instanceof Error ? e.message : String(e);
    throw _auditFailure('ReportWriteFailed', `${REPORT_WRITE_FAILURE_MESSAGE}${_reason}`);
  }
};

/**
 * 変異体が 0 件のとき `runMutants` の代わりに使う、何も実行しなかった結果を作る (index R-008)。
 *
 * @returns 判定・残骸が空で、中断していない実行結果
 */
const _emptyRun = (): RunMutantsResult => ({ results: [], leftovers: [], interrupted: false });

/**
 * 監査の実行結果から `formatReport` に渡すレポートの入力を組み立てる。
 *
 * @param mutants - 生成した全変異体
 * @param run - `runMutants` の結果
 * @param match - `matchAllowlist` の結果
 * @param drift - 実行前後で内容が変わった元ソースのパス
 * @param aborted - レポートを組み立てる時点で SIGINT を受けているか (`runMutants` の外で受けた中断も中断として扱う)
 * @returns レポートの入力
 */
const _buildRunReport = (
  mutants: readonly Mutant[],
  run: RunMutantsResult,
  match: AllowlistMatch,
  drift: string[],
  aborted: boolean,
): MutationRunReport => ({
  generatedCount: mutants.length,
  results: run.results,
  match,
  drift,
  leftovers: run.leftovers,
  interrupted: run.interrupted || aborted,
  auditFailures: [],
});

/**
 * 変異体を 1 件も判定せずに中断したときの `formatReport` の入力を組み立てる (execution R-227 / report-cli R-605)。
 *
 * @param drift - 実行前後で内容が変わった元ソースのパス (drift 検査を省いたときは空)
 * @returns 判定 0 件で中断を明示するレポートの入力
 */
const _interruptedReport = (drift: string[]): MutationRunReport =>
  _buildRunReport([], _emptyRun(), { allowed: [], unallowed: [], stale: [] }, drift, true);

/**
 * ハッシュ記録を終える前の中断の検査点。SIGINT を受けていれば判定 0 件の中断レポートを書き出す (execution R-227)。
 *
 * 進行中の工程 (掃除・ハッシュ記録) を終えてから呼ぶ。この時点の中断では drift 検査を省く。
 *
 * @param signal - SIGINT で中止される信号
 * @param writeReport - レポートを書き出す関数
 * @returns 中断していて中断レポートを書き出したとき `true`
 * @throws {ChatlogError} レポートを書き出せなかったとき (`FailFast` / `ReportWriteFailed`)
 */
const _reportedEarlyInterrupt = async (signal: AbortSignal, writeReport: MainDeps['writeReport']): Promise<boolean> => {
  if (!signal.aborted) {
    return false;
  }
  await _writeReportOrFail(writeReport, formatReport(_interruptedReport([])));
  return true;
};

/**
 * 変異テストの監査を規定の順序で実行する (index DD-01 / REQ-C-003)。
 *
 * 引数 → 対象解決 → 許容リスト → ロック取得 → SIGINT 登録 → 掃除 → ハッシュ → ベースライン → 生成 →
 * 変異体の実行 → 照合 → drift → レポート → ロック解放の順に進む。ロック取得後はどの経路でもロックを解放する。
 * 掃除またはハッシュ記録を終えた時点で SIGINT を受けていれば、以降の工程 (ハッシュ記録・ベースライン) へ進まず
 * 判定 0 件の中断レポートを書き出し、中断の終了コードを返す (execution R-227)。
 * ベースラインが SIGINT で中断した (`interrupted`) ときは失敗として扱わず、drift 検査の結果を載せた
 * 判定 0 件の中断レポートを書き出して中断の終了コードを返す (execution R-228)。
 * ベースライン以降に受けた SIGINT は、`runMutants` の外 (生成・drift 検査) で受けたものもレポートの中断として扱う。
 * `Deno.exit()` は呼ばず、終了コードを返す。
 *
 * @param argv - CLI 引数 (省略時は `Deno.args`)
 * @param deps - 差し替える依存 (省略した依存は production 実装)
 * @returns 終了コード
 * @throws {ChatlogError} 引数・許容リスト・ロックの取得が不正なとき
 * @throws {ChatlogError} 起動時の残骸掃除で削除できなかったファイルがあるとき (監査単位の失敗。ロックは解放する)
 * @throws {ChatlogError} ベースラインが失敗したとき (監査単位の失敗。drift を標準エラー出力へ列挙し、ロックは解放する)
 * @throws {ChatlogError} レポートを書き出せなかったとき (監査単位の失敗。ロックは解放する)
 */
export const main = async (argv?: string[], deps: Partial<MainDeps> = {}): Promise<number> => {
  const {
    resolveTargets: _resolveTargets = resolveTargets,
    loadAllowlist: _loadAllowlist = loadAllowlist,
    acquireLock: _acquireLock = acquireLock,
    releaseLock: _releaseLock = releaseLock,
    sweepArtifacts: _sweepArtifacts = sweepArtifacts,
    hashSources: _hashSources = hashSources,
    runBaseline: _runBaseline = runBaseline,
    generateMutants: _generateMutants = generateMutants,
    runMutants: _runMutants = runMutants,
    matchAllowlist: _matchAllowlist = matchAllowlist,
    readSource: _readSource = _readRepoSource,
    writeReport: _writeReport = _writeStdout,
    signals: _signals = _denoSignals,
  } = deps;
  const _args = parseMutateArgs(argv ?? Deno.args);
  const _targets = await _resolveTargets(_args.module);
  const _entries = await _loadAllowlist(_args.module);
  const _token = await _acquireLock(DEFAULT_LOCK_PATH);
  const _ctl = new AbortController();
  const _unregister = _signals.onInterrupt(() => _ctl.abort());
  try {
    _assertSwept(
      await _sweepArtifacts(_sweepDirsOf(_targets.sources), { shallowDirs: [dirname(DENO_CONFIG_PATH)] }),
    );
    if (await _reportedEarlyInterrupt(_ctl.signal, _writeReport)) {
      return EXIT_CODE_INTERRUPTED;
    }
    const _hashesBefore = await _hashSources(_targets.sources);
    if (await _reportedEarlyInterrupt(_ctl.signal, _writeReport)) {
      return EXIT_CODE_INTERRUPTED;
    }
    const _timeoutMs = _args.timeoutSec * 1000;
    const _testArgs = ['test', ...MUTATION_TEST_PERMISSIONS, ..._targets.tests];
    const _checkDrift = async (): Promise<string[]> => detectDrift(_hashesBefore, await _hashSources(_targets.sources));
    const _baseline = await _runBaseline(runDenoTest, _testArgs, { timeoutMs: _timeoutMs, signal: _ctl.signal });
    if (_baseline.kind === 'interrupted') {
      await _writeReportOrFail(_writeReport, formatReport(_interruptedReport(await _checkDrift())));
      return EXIT_CODE_INTERRUPTED;
    }
    await _assertBaselinePassed(_baseline, _checkDrift);
    const _mutants = await _generateAllMutants(_targets.sources, _readSource, _generateMutants);
    const _run = _mutants.length === 0 ? _emptyRun() : await _runMutants(_mutants, {
      configPath: DENO_CONFIG_PATH,
      testArgs: _testArgs,
      timeoutMs: _timeoutMs,
      signal: _ctl.signal,
    });
    const _match = _matchAllowlist(_mutants, _run.results, _entries);
    const _drift = await _checkDrift();
    const _report = _buildRunReport(_mutants, _run, _match, _drift, _ctl.signal.aborted);
    await _writeReportOrFail(_writeReport, formatReport(_report));
    return decideExitCode(_report, _args.strict);
  } finally {
    _unregister();
    await _releaseLock(_token);
  }
};
