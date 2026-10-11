// src: scripts/testing/mutate-tester.ts
// @(#): 変異テストの CLI エントリポイント (引数解析・監査の実行)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { dirname, join, resolve } from '@std/path';

import { ChatlogError } from '../../skills/_cle-libs/classes/ChatlogError.class.ts';
import { logger } from '../../skills/_cle-libs/libs/io/logger.ts';
import { parseOptions } from '../../skills/_cle-libs/libs/io/parse-args.ts';
import type { ArgSchema, ParsedArgs } from '../../skills/_cle-libs/types/args-schema.types.ts';
import { loadAllowlist, matchAllowlist } from './mutation/allowlist.ts';
import { runBaseline } from './mutation/baseline.ts';
import {
  BASELINE_ABORT_DRIFT_MESSAGE,
  DEFAULT_LOCK_PATH,
  DEFAULT_TIMEOUT_SEC,
  DENO_CONFIG_PATH,
  EXIT_CODE_FAILURE,
  EXIT_CODE_INTERRUPTED,
  INVALID_TIMEOUT_MESSAGE,
  MAX_TIMEOUT_SEC,
  MISSING_MODULE_MESSAGE,
  MUTATE_MODULES,
  MUTATE_MODULES_NOTE,
  MUTATE_UNSUPPORTED_OPTIONS,
  MUTATION_TEST_PERMISSIONS,
  REPO_ROOT,
  REPORT_WRITE_FAILURE_MESSAGE,
  SWEEP_FAILURE_MESSAGE,
  UNKNOWN_MODULE_MESSAGE,
  UNSUPPORTED_OPTION_MESSAGE,
  WRONG_WORKING_DIRECTORY_MESSAGE,
} from './mutation/constants/mutation.constants.ts';
import { generateMutants } from './mutation/generate-mutants.ts';
import { decideExitCode, formatReport } from './mutation/report.ts';
import { resolveTargets } from './mutation/resolve-targets.ts';
import { runDenoTest } from './mutation/run-deno-test.ts';
import { runMutants } from './mutation/run-mutants.ts';
import {
  acquireLockEnsuringDir,
  detectDrift,
  hashSources,
  releaseLock,
  sweepArtifacts,
} from './mutation/run-safety.ts';
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
  TestArgs,
} from './mutation/types/mutation.types.ts';

export type { MainDeps, MutateArgs } from './mutation/types/mutation.types.ts';

/** `parseOptions` が解釈するオプションのフィールド。 */
type _MutateOptionFields = {
  /** `--strict` の指定有無。 */
  strict: boolean;
  /**
   * `--timeout` の生の値。スキーマに載せるのは `parseOptions` に受理させるためで、
   * 値の検査は `_scanArg` で拾った値に対して自前で行う (`integer` 型は `30s` を受理するため)。
   */
  timeout: string;
};

/** `--timeout` のオプション名。 */
const _TIMEOUT_OPTION = '--timeout';

/** mutate-tester のオプションのスキーマ。 */
const _MUTATE_ARG_SCHEMA: ArgSchema<_MutateOptionFields> = [
  { option: '--strict', field: 'strict', type: 'flag' },
  { option: _TIMEOUT_OPTION, field: 'timeout', type: 'string' },
];

/** 次の引数を値として消費するオプション名 (`parseOptions` が値を取る `flag` 以外のオプション)。 */
const _VALUE_OPTIONS: readonly string[] = [..._MUTATE_ARG_SCHEMA, ...MUTATE_UNSUPPORTED_OPTIONS]
  .filter((entry) => entry.type !== 'flag')
  .map((entry) => entry.option);

/**
 * モジュール名と `--timeout` を `parseOptions` より先に判定するための、引数の緩い走査の状態 (report-cli DD-11)。
 *
 * 未知のオプションや値の欠落があっても例外を投げずに走査を続ける。
 */
type _ArgScan = {
  /** `--` で始まらない引数 (オプションの値として消費したものを除く)。出現順。 */
  positionals: readonly string[];
  /**
   * `--timeout` の生の値。指定が無ければ `undefined`、値が欠落していれば空文字列。
   *
   * 複数指定では走査は最後の値を残すが、`parseOptions` は最初の不正な値 (空の値など) で止まる。
   * どちらで判定しても結果は `InvalidArgs` の例外になる。オプションの重複指定の扱いは report-cli の Open Question #5。
   */
  timeout: string | undefined;
  /** 直前のオプションが次の引数を値として消費するとき、そのオプション名。 */
  pendingOption: string | undefined;
};

/** 引数の緩い走査の初期状態。 */
const _EMPTY_SCAN: _ArgScan = { positionals: [], timeout: undefined, pendingOption: undefined };

/**
 * 引数 1 件を緩く走査して状態を進める。値の消費は `parseOptions` と同じ規則に従う。
 *
 * @param scan - 直前までの走査の状態
 * @param arg - 走査する引数
 * @returns 引数を反映した走査の状態
 */
const _scanArg = (scan: _ArgScan, arg: string): _ArgScan => {
  if (scan.pendingOption !== undefined) {
    return {
      ...scan,
      pendingOption: undefined,
      timeout: scan.pendingOption === _TIMEOUT_OPTION ? arg : scan.timeout,
    };
  }
  if (!arg.startsWith('--')) {
    return { ...scan, positionals: [...scan.positionals, arg] };
  }
  const _eqIdx = arg.indexOf('=');
  const _hasValue = _eqIdx !== -1;
  const _name = _hasValue ? arg.slice(0, _eqIdx) : arg;
  return {
    ...scan,
    timeout: _name === _TIMEOUT_OPTION ? arg.slice(_name.length + 1) : scan.timeout,
    pendingOption: !_hasValue && _VALUE_OPTIONS.includes(_name) ? _name : undefined,
  };
};

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
 * `--timeout` の生の値が受理できる秒数かを判定する (report-cli DD-03)。
 *
 * 数字だけの並びに限ることで `Number()` の指数・16 進・符号・小数表記を退け、上限で桁数の大きい値も退けるため、
 * 受理する値は常に安全な整数になる。
 *
 * @param raw - `--timeout` の生の値
 * @returns 数字だけで構成され、かつ 1 以上 `MAX_TIMEOUT_SEC` 以下のとき `true`
 */
const _isTimeoutInRange = (raw: string): boolean => {
  const _n = Number(raw);
  return _DIGITS_ONLY.test(raw) && _n >= 1 && _n <= MAX_TIMEOUT_SEC;
};

/**
 * `--timeout` の値を検証して秒数に変換する。
 *
 * @param raw - `--timeout` の生の値 (省略時は `undefined`、値の欠落は空文字列)
 * @returns 制限時間 (秒)。省略時は既定値
 * @throws {ChatlogError} 値が欠落しているか 1〜`MAX_TIMEOUT_SEC` の整数でないとき (`InvalidArgs` / `InvalidTimeout`)
 */
const _toTimeoutSec = (raw: string | undefined): number => {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_SEC;
  }
  if (!_isTimeoutInRange(raw)) {
    throw new ChatlogError('InvalidArgs', 'InvalidTimeout', `${INVALID_TIMEOUT_MESSAGE}${raw}`);
  }
  return Number(raw);
};

/**
 * 共有の引数解析が既定で受け付けるが mutate-tester が定義しないオプションを拒否する (report-cli R-622)。
 *
 * 値の有無ではなくフィールドの存在で判定するため、否定形 (`--no-dry-run`) で `false` が入った場合も拒否する。
 *
 * @param config - `parseOptions` が返した設定
 * @throws {ChatlogError} 定義しないオプションが指定されていたとき (`InvalidArgs` / `UnknownOption`)
 */
const _rejectUnsupportedOptions = (config: ParsedArgs): void => {
  const _unsupported = MUTATE_UNSUPPORTED_OPTIONS.find((entry) => entry.field in config);
  if (_unsupported !== undefined) {
    throw new ChatlogError('InvalidArgs', 'UnknownOption', `${UNSUPPORTED_OPTION_MESSAGE}${_unsupported.option}`);
  }
};

/**
 * mutate-tester の CLI 引数から実行条件を確定する (report-cli R-604)。
 *
 * 規則は R-601 → R-602 → R-603 → R-622 の順に判定する。引数の並び・値の欠落・未知のオプションに関わらず
 * この順を守るため、モジュール名と `--timeout` は例外を投げない緩い走査で拾い、`parseOptions` より先に検査する (DD-11)。
 *
 * @param argv - CLI 引数 (`<module> [--strict] [--timeout <sec>]`)
 * @returns 対象モジュール・`--strict`・制限時間
 * @throws {ChatlogError} モジュール名が欠落しているとき (`InvalidArgs` / `MissingModule`。R-601)
 * @throws {ChatlogError} モジュール名が許可リストに無いとき (`InvalidArgs` / `UnknownModule`。R-602)
 * @throws {ChatlogError} `--timeout` の値が欠落しているか 1〜`MAX_TIMEOUT_SEC` の整数でないとき (`InvalidArgs` / `InvalidTimeout`。R-603)
 * @throws {ChatlogError} 本 CLI が定義しないオプションが指定されたとき (`InvalidArgs`。R-622)
 */
export const parseMutateArgs = (argv: string[]): MutateArgs => {
  const _scan = argv.reduce(_scanArg, _EMPTY_SCAN);
  const _module = _toMutateModule(_scan.positionals[0]);
  const _timeoutSec = _toTimeoutSec(_scan.timeout);
  // R-622: 未知のオプションと既定スキーマの値の不正は parseOptions が投げ、受理された既定スキーマのオプションはここで拒否する
  const { config: _config } = parseOptions<_MutateOptionFields>(argv, _MUTATE_ARG_SCHEMA);
  _rejectUnsupportedOptions(_config);
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
 * 作業ディレクトリがリポジトリルートであることを確かめる (index R-001 / DD-09)。
 *
 * `resolve` で正規化して比べるため、末尾の区切り文字の有無は区別しない。
 *
 * @param dir - 作業ディレクトリ
 * @throws {ChatlogError} リポジトリルートでないとき (`InvalidPath` / `WrongWorkingDirectory`)
 */
const _assertRepoRootCwd = (dir: string): void => {
  if (resolve(dir) !== resolve(REPO_ROOT)) {
    throw new ChatlogError(
      'InvalidPath',
      'WrongWorkingDirectory',
      `${WRONG_WORKING_DIRECTORY_MESSAGE}${dir} (期待: ${REPO_ROOT})`,
    );
  }
};

/**
 * 変異テストの監査を規定の順序で実行する (index DD-01 / REQ-C-003)。
 *
 * 引数 → 作業ディレクトリの検査 → 対象解決 → 許容リスト → ロックの親ディレクトリ作成 → ロック取得 →
 * SIGINT 登録 → 掃除 → ハッシュ → ベースライン → 生成 → 変異体の実行 → 照合 → drift → レポート →
 * ロック解放 → SIGINT 解除の順に進む。
 * ロックの親ディレクトリだけはロック取得より前に作る (execution R-201 の例外 / OQ-2)。
 * ロック取得後はどの経路 (SIGINT の登録・解除の失敗を含む) でもロックを解放する。
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
 * @throws {ChatlogError} 作業ディレクトリがリポジトリルートでないとき (`InvalidPath` / `WrongWorkingDirectory`。何も実行しない)
 * @throws {ChatlogError} 起動時の残骸掃除で削除できなかったファイルがあるとき (監査単位の失敗。ロックは解放する)
 * @throws {ChatlogError} ベースラインが失敗したとき (監査単位の失敗。drift を標準エラー出力へ列挙し、ロックは解放する)
 * @throws {ChatlogError} レポートを書き出せなかったとき (監査単位の失敗。ロックは解放する)
 */
export const main = async (argv?: string[], deps: Partial<MainDeps> = {}): Promise<number> => {
  const {
    resolveTargets: _resolveTargets = resolveTargets,
    loadAllowlist: _loadAllowlist = loadAllowlist,
    acquireLock: _acquireLock = acquireLockEnsuringDir,
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
    cwd: _cwd = Deno.cwd,
  } = deps;
  const _args = parseMutateArgs(argv ?? Deno.args);
  _assertRepoRootCwd(_cwd());
  const _targets = await _resolveTargets(_args.module);
  const _entries = await _loadAllowlist(_args.module);
  const _token = await _acquireLock(DEFAULT_LOCK_PATH);
  const _ctl = new AbortController();
  let _unregister: (() => void) | undefined;
  try {
    _unregister = _signals.onInterrupt(() => _ctl.abort());
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
    const _testArgs: TestArgs = ['test', ...MUTATION_TEST_PERMISSIONS, ..._targets.tests];
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
    await _releaseLock(_token);
    _unregister?.();
  }
};

if (import.meta.main) {
  try {
    Deno.exit(await main());
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    Deno.exit(EXIT_CODE_FAILURE);
  }
}
