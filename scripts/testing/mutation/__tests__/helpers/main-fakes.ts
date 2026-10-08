// src: scripts/testing/mutation/__tests__/helpers/main-fakes.ts
// @(#): mutate-tester の main に注入する fake 一式 (テストヘルパー)
//       呼び出しを 1 本の記録配列へ積み、SIGINT の handler を任意の時点で呼べるようにする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { makeLoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';
import { REPORT_HEADING_DRIFT, REPORT_HEADING_LEFTOVERS } from '../../constants/mutation.constants.ts';

// types
import type { LoggerStub } from '../../../../../skills/_cle-libs/__tests__/helpers/logger-stub.ts';
import type {
  LockToken,
  MainDeps,
  Mutant,
  ResolvedTargets,
  SourceHashes,
} from '../../types/mutation.types.ts';

// ─── constants

/** fake の `resolveTargets` が返すソース集合。 */
export const FAKE_SOURCES: readonly string[] = ['libs/a.ts'];

/** fake の `resolveTargets` が返すテスト集合。 */
export const FAKE_TESTS: readonly string[] = ['libs/__tests__/unit/a.unit.spec.ts'];

/** fake の `acquireLock` が返すロックの持ち主の証明。 */
export const FAKE_LOCK_TOKEN: LockToken = { path: 'temp/mutation.lock', id: 'tok-1' };

/** fake の `hashSources` が返す内容ハッシュ (実行前後で一致し、drift は無い)。 */
export const FAKE_HASHES: SourceHashes = { 'libs/a.ts': 'h-a1' };

/** drift を再現するときの実行後の内容ハッシュ (`FAKE_HASHES` と値が異なる)。 */
export const FAKE_DRIFT_HASHES: SourceHashes = { 'libs/a.ts': 'h-a2' };

/** fake の `readSource` が返すソースの内容。 */
export const FAKE_SOURCE_TEXT = 'export const a = 1 < 2;\n';

// ─── types

/** `makeMainDeps` の戻り値。 */
export type MainFakes = {
  /** 記録付きの fake を揃えた依存の一式。 */
  deps: MainDeps;
  /** 各 fake が呼ばれた順に積む依存名 (`readSource` は積まない)。 */
  calls: string[];
  /** `signals.onInterrupt` に登録された handler を呼んで SIGINT を再現する (未登録なら何もしない)。 */
  sigint: () => void;
};

// ─── functions

/**
 * テスト用の変異体を作る。
 *
 * @param file - 対象ファイルのパス
 * @param line - 1 始まりの行番号
 * @returns `<` を `<=` に置き換える relational 変異体
 */
export const mutant = (file: string, line: number): Mutant => ({
  file,
  line,
  column: 18,
  op: 'relational',
  before: '<',
  after: '<=',
  lineText: 'export const a = 1 < 2;',
});

/**
 * `main` の結果を、返した終了コードか `'rejected'` に畳む。
 *
 * @param promise - `main` の戻り値
 * @returns 解決したら終了コード、reject したら `'rejected'`
 */
export const outcomeOf = (promise: Promise<number>): Promise<number | 'rejected'> =>
  promise.catch(() => 'rejected' as const);

/**
 * レポートの一覧の節に並ぶ項目を取り出す。
 *
 * 変異体の行もファイルパスを含むため、`<heading> (` で始まる見出しの直下から
 * 空行の手前までに限って読む。
 *
 * @param report - `writeReport` に渡されたレポート
 * @param heading - 節の見出し
 * @returns 節の各行 (前後の空白を除く)。見出しが無ければ `undefined`
 */
const _reportSection = (report: string, heading: string): string[] | undefined => {
  const _lines = report.split('\n');
  const _headingAt = _lines.findIndex((line) => line.startsWith(`${heading} (`));
  if (_headingAt === -1) {
    return undefined;
  }
  const _section = _lines.slice(_headingAt + 1);
  const _sectionEnd = _section.indexOf('');
  return _section.slice(0, _sectionEnd === -1 ? undefined : _sectionEnd).map((line) => line.trim());
};

/**
 * レポートの drift 節に並ぶファイルを取り出す。
 *
 * @param report - `writeReport` に渡されたレポート
 * @returns drift 節の各行 (前後の空白を除く)。見出しが無ければ `undefined`
 */
export const driftSection = (report: string): string[] | undefined => _reportSection(report, REPORT_HEADING_DRIFT);

/**
 * レポートの残骸節に並ぶファイルを取り出す。
 *
 * @param report - `writeReport` に渡されたレポート
 * @returns 残骸節の各行 (前後の空白を除く)。見出しが無ければ `undefined`
 */
export const leftoversSection = (report: string): string[] | undefined =>
  _reportSection(report, REPORT_HEADING_LEFTOVERS);

/**
 * logger をスタブした状態で `action` を実行し、終了後 (失敗時も) にスタブを外す。
 *
 * @param action - logger の出力を捕捉したい処理
 * @returns `action` の結果と、捕捉した出力を持つ logger スタブ
 */
export const withLoggerStub = async <T>(action: () => Promise<T>): Promise<{ result: T; loggerStub: LoggerStub }> => {
  const _loggerStub = makeLoggerStub();
  try {
    return { result: await action(), loggerStub: _loggerStub };
  } finally {
    _loggerStub.restore();
  }
};

/**
 * 呼び出し回数で振る舞いを切り替える fake を作る。
 *
 * @param n - `nth` に委譲する呼び出しの回数 (1 始まり)
 * @param nth - `n` 回目の呼び出しで委譲する関数
 * @param otherwise - それ以外の呼び出しで委譲する関数
 * @returns `n` 回目だけ `nth`、ほかは `otherwise` に委譲する関数
 */
export const nthCall = <A extends unknown[], R>(
  n: number,
  nth: (...args: A) => R,
  otherwise: (...args: A) => R,
): (...args: A) => R => {
  let _count = 0;
  return (...args: A): R => (++_count === n ? nth : otherwise)(...args);
};

/**
 * 2 回目 (実行後) の呼び出しで `libs/a.ts` のハッシュが変わる (drift) `hashSources` の fake を作る。
 *
 * 呼び出し回数を数える状態を持つため、テストごとに新しく作る (テスト間で共有しない)。
 *
 * @returns 1 回目は `FAKE_HASHES`、2 回目は `FAKE_DRIFT_HASHES` を返す `hashSources`
 */
export const driftingHashSources = (): MainDeps['hashSources'] =>
  nthCall(
    2,
    () => Promise.resolve({ ...FAKE_DRIFT_HASHES }),
    () => Promise.resolve({ ...FAKE_HASHES }),
  );

/**
 * すべての工程が成功する既定の fake を作る。
 *
 * @param store - `signals.onInterrupt` が handler を保持する入れ物
 * @returns 既定の fake の一式 (呼び出しは記録しない)
 */
const _defaultDeps = (store: { handler?: () => void }): MainDeps => ({
  resolveTargets: (): Promise<ResolvedTargets> =>
    Promise.resolve({ sources: [...FAKE_SOURCES], tests: [...FAKE_TESTS] }),
  loadAllowlist: () => Promise.resolve([]),
  acquireLock: () => Promise.resolve(FAKE_LOCK_TOKEN),
  releaseLock: () => Promise.resolve(),
  sweepArtifacts: () => Promise.resolve([]),
  hashSources: () => Promise.resolve({ ...FAKE_HASHES }),
  runBaseline: () => Promise.resolve({ kind: 'ok' }),
  generateMutants: (_source, filePath) => [mutant(filePath, 1)],
  runMutants: (mutants) =>
    Promise.resolve({
      results: mutants.map((m) => ({ mutant: m, status: 'killed' as const })),
      leftovers: [],
      interrupted: false,
    }),
  matchAllowlist: () => ({ allowed: [], unallowed: [], stale: [] }),
  readSource: () => Promise.resolve(FAKE_SOURCE_TEXT),
  writeReport: () => {},
  signals: {
    onInterrupt: (handler) => {
      store.handler = handler;
      return () => {
        store.handler = undefined;
      };
    },
  },
});

/**
 * 関数を、呼ばれたら依存名を記録してから委譲する関数に包む。
 *
 * @param name - 記録する依存名
 * @param calls - 呼び出しを積む記録配列
 * @param fn - 委譲先
 * @returns 記録付きの関数
 */
const _recorded = <A extends unknown[], R>(name: string, calls: string[], fn: (...args: A) => R) => (...args: A): R => {
  calls.push(name);
  return fn(...args);
};

/**
 * `main` に注入する記録付きの fake 一式を作る。
 *
 * `overrides` で差し替えた依存も記録の対象になる (`readSource` を除く)。
 *
 * @param overrides - 既定の fake から差し替える依存
 * @returns 依存の一式・呼び出し記録・SIGINT の再現関数
 */
export const makeMainDeps = (overrides: Partial<MainDeps> = {}): MainFakes => {
  const _calls: string[] = [];
  const _store: { handler?: () => void } = {};
  const _base: MainDeps = { ..._defaultDeps(_store), ...overrides };
  const _deps: MainDeps = {
    resolveTargets: _recorded('resolveTargets', _calls, _base.resolveTargets),
    loadAllowlist: _recorded('loadAllowlist', _calls, _base.loadAllowlist),
    acquireLock: _recorded('acquireLock', _calls, _base.acquireLock),
    releaseLock: _recorded('releaseLock', _calls, _base.releaseLock),
    sweepArtifacts: _recorded('sweepArtifacts', _calls, _base.sweepArtifacts),
    hashSources: _recorded('hashSources', _calls, _base.hashSources),
    runBaseline: _recorded('runBaseline', _calls, _base.runBaseline),
    generateMutants: _recorded('generateMutants', _calls, _base.generateMutants),
    runMutants: _recorded('runMutants', _calls, _base.runMutants),
    matchAllowlist: _recorded('matchAllowlist', _calls, _base.matchAllowlist),
    readSource: _base.readSource,
    writeReport: _recorded('writeReport', _calls, _base.writeReport),
    signals: { onInterrupt: _recorded('signals.onInterrupt', _calls, _base.signals.onInterrupt) },
  };
  return { deps: _deps, calls: _calls, sigint: () => _store.handler?.() };
};
