// src: scripts/testing/mutation/types/mutation.types.ts
// @(#): ミューテーションテストで扱う変異体・判定・許容リストの型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** 変異演算子の種別。 */
export type MutationOp = 'relational' | 'equality' | 'logical' | 'boolean' | 'number' | 'negation';

/**
 * ソース中の 1 箇所を置換する変異体。
 *
 * 適用 = (`line`, `column`) にある `before` を `after` に置き換えること。
 */
export type Mutant = {
  /** 対象ファイルのパス。 */
  file: string;
  /** 1 始まりの行番号。 */
  line: number;
  /** 1 始まりの桁番号 (UTF-16 コード単位。サロゲートペアは 2 桁と数える)。 */
  column: number;
  /** 変異演算子の種別。 */
  op: MutationOp;
  /** 置換前の字句。 */
  before: string;
  /** 置換後の字句 (除去は空文字列)。 */
  after: string;
  /** 元の行全体 (改行・`\r` を含まない)。 */
  lineText: string;
};

/** 変異体 1 件の判定 (DR-02)。 */
export type MutantStatus = 'killed' | 'survived' | 'timeout' | 'error' | 'compile-error';

/**
 * テストを 1 回実行した結果。
 *
 * `exited` は終了コードと出力を保持する (判定時に stdout と stderr を連結する)。
 * `timeout` は制限時間で直接の子プロセスを終了させたこと、`error` は起動・書き出しの失敗を表す。
 */
export type TestRunOutcome =
  | { kind: 'exited'; code: number; stdout: string; stderr: string }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

/** テスト実行の制限時間と中断信号。 */
export type TestRunOptions = {
  /** 1 回の実行の制限時間 (ミリ秒)。 */
  timeoutMs: number;
  /** 中断信号。中止されたら実行中の子プロセスを終了させる。 */
  signal?: AbortSignal;
};

/** `deno test` の起動を担う注入可能な提供元 (REQ-NF-002)。 */
export type TestRunnerProvider = (args: string[], options: TestRunOptions) => Promise<TestRunOutcome>;

/**
 * 起動した `deno` 子プロセスのうち、テスト実行が使う部分。
 *
 * `Deno.ChildProcess` (stdout / stderr を `piped` で起動したもの) はこの型に代入できる。
 * テストでは実プロセスを起動せず、この形のスタブを返す。
 */
export type DenoChildProcess = {
  /** 標準出力のバイト列ストリーム。 */
  stdout: ReadableStream<Uint8Array>;
  /** 標準エラーのバイト列ストリーム。 */
  stderr: ReadableStream<Uint8Array>;
  /** 子プロセスの終了を待つ。解決値は終了コードを持つ。 */
  status: Promise<{ code: number }>;
  /** 子プロセスへシグナルを送って終了させる。 */
  kill: (signal?: Deno.Signal) => void;
};

/**
 * コマンド名と起動引数を受け取って子プロセスを起動する注入可能な提供元 (REQ-NF-002)。
 * `runDenoTest` はコマンド名に `'deno'` を渡す。
 */
export type DenoSpawnProvider = (cmd: string, args: string[]) => DenoChildProcess;

/** `runDenoTest` の引数。`TestRunOptions` に子プロセスの起動元の注入を加える。 */
export type RunDenoTestOptions = TestRunOptions & {
  /** 子プロセスの起動元。省略時は実際の `deno` を起動する。 */
  spawn?: DenoSpawnProvider;
};

/** 変異体 1 件とその判定。 */
export type MutantResult = {
  /** 判定した変異体。 */
  mutant: Mutant;
  /** 判定。 */
  status: MutantStatus;
};

/** 許容リストの 1 エントリ (等価変異体の判断記録)。照合キーは `reason` を除く 6 属性 (DR-04)。 */
export type AllowlistEntry = {
  /** 対象ファイル (リポジトリルート相対、`/` 区切り)。 */
  file: string;
  /** 行テキスト。照合時に前後の空白を除く。 */
  lineText: string;
  /** 変異演算子の種別。 */
  op: MutationOp;
  /** 置換前の字句。 */
  before: string;
  /** 置換後の字句 (空文字列を許す)。 */
  after: string;
  /** 同一行で置換前の字句が同じ適用箇所を左から数えた順位 (1 始まり)。 */
  occurrence: number;
  /** 等価と判断した理由 (必須・空不可)。 */
  reason: string;
};

/** `loadAllowlist` の読み込みオプション。 */
export type LoadAllowlistOptions = {
  /** 許容リスト (`<module>.yaml`) の読み込み元ディレクトリ。省略時は `scripts/testing/mutation/allowlist/`。 */
  allowlistDir?: string;
};

/** 許容リストとの照合結果。 */
export type AllowlistMatch = {
  /** 許容済みの生存変異体。 */
  allowed: Mutant[];
  /** 未許容の生存変異体。 */
  unallowed: Mutant[];
  /** 生成されたどの変異体にも一致しない古いエントリ。 */
  stale: AllowlistEntry[];
};

/** `formatReport` の入力。1 回の変異テスト実行の結果をまとめたもの。 */
export type MutationRunReport = {
  /** 生成した変異体の件数 (中断時も生成時点の件数)。 */
  generatedCount: number;
  /** 判定済みの変異体の結果の列。 */
  results: MutantResult[];
  /** `matchAllowlist` の結果。`formatReport` は表示するだけで照合をやり直さない。 */
  match: AllowlistMatch;
  /** 実行前後で内容が変わった元ソースのパス。 */
  drift: string[];
  /** 後始末で削除できなかったファイルのパス。 */
  leftovers: string[];
  /** SIGINT で中断したか。 */
  interrupted: boolean;
  /** 監査単位の失敗 (DD-14) の理由。 */
  auditFailures: string[];
};

/** `runMutants` のオプション。 */
export type RunMutantsOptions = {
  /** 元の設定 (`deno.jsonc`) のパス。一時設定はこれと同じディレクトリに置く。 */
  configPath: string;
  /** `deno` に渡す引数。先頭 (サブコマンド) の直後に `--config <一時設定>` を差し込む。 */
  testArgs: string[];
  /** 変異体 1 件あたりの実行の制限時間 (ミリ秒)。 */
  timeoutMs: number;
  /** テストを 1 回実行する provider。省略時は `runDenoTest`。 */
  testRunner?: TestRunnerProvider;
  /** 中断信号。 */
  signal?: AbortSignal;
};

/** `runMutants` の結果。 */
export type RunMutantsResult = {
  /** 変異体ごとの判定 (入力順)。 */
  results: MutantResult[];
  /** 後始末で削除できなかったファイルのパス。 */
  leftovers: string[];
  /** 中断信号で途中終了したか。 */
  interrupted: boolean;
};

/** 変異前のベースライン実行の結果 (DR-08)。`interrupted` は中断で、`failed` とは区別する。 */
export type BaselineResult =
  | { kind: 'ok' }
  | { kind: 'failed'; reason: string }
  | { kind: 'interrupted' };

/** `resolveTargets` の探索オプション。 */
export type ResolveTargetsOptions = {
  /** 探索起点 (リポジトリルート)。省略時は `resolve-targets.ts` から導いたリポジトリルート。 */
  rootDir?: string;
};

/** `resolveTargets` の結果。パスはいずれもリポジトリルート相対・`/` 区切り。 */
export type ResolvedTargets = {
  /** 変異させるソースファイルの集合。 */
  sources: string[];
  /** 判定に使うテストファイルの集合。 */
  tests: string[];
};

/**
 * 変異テストが受け付けるモジュール短縮名 (`libs` / `classify` / `export` / `filter` / `normalize` / `set` の 6 件)。
 * aplys-tester の `ValidModule` (`all` を含まない) から、ソース集合を持たない `classes` と `scripts` を除く。
 */
export type MutateModule = Exclude<import('../../../aplys-tester.ts').ValidModule, 'classes' | 'scripts'>;

/** `parseMutateArgs` の結果。mutate-tester の CLI 引数から確定した実行条件 (report-cli R-604)。 */
export type MutateArgs = {
  /** 変異テストの対象モジュール。 */
  module: MutateModule;
  /** `--strict` の指定有無。省略時は `false`。 */
  strict: boolean;
  /** 変異体 1 件あたりのテストの制限時間 (秒)。省略時は `DEFAULT_TIMEOUT_SEC`。 */
  timeoutSec: number;
};

/**
 * `applyMutant` の結果。例外を投げずに成否を返す。
 *
 * `ok: true` は変異体を適用したソース全体を持つ。`ok: false` は変異体の位置と字句がソースと一致しなかったことを表す (R-214)。
 */
export type ApplyMutantResult =
  | { ok: true; source: string }
  | { ok: false; reason: string };

/**
 * Deno の設定 (`deno.jsonc`) を表すオブジェクト。
 *
 * `imports` 以外のキーは中身を解釈せずそのまま持ち回る (execution DD-02)。
 */
export type DenoConfig = Record<string, unknown> & {
  /** import の対応表 (指定子 → 解決先)。 */
  imports?: Record<string, string>;
};

/** deno test の要約行から取り出したテスト件数 (step 件数ではない)。 */
export type TestSummary = {
  /** 成功したテストの件数。 */
  passed: number;
  /** 失敗したテストの件数。 */
  failed: number;
};

/**
 * 実行ロックのファイルに JSON で書く記録 (execution R-203 / DD-07)。
 *
 * 既存ロックの報告と、解放時の持ち主の照合に使う。
 */
export type LockRecord = {
  /** ロックを取得したプロセスの PID。 */
  pid: number;
  /** ロックを作成した時刻 (ISO 8601)。 */
  createdAt: string;
  /** 実行ごとに生成するランダム ID。解放時に自分のロックかを照合する。 */
  id: string;
};

/** `acquireLock` が返し、`releaseLock` に渡すロックの持ち主の証明。 */
export type LockToken = {
  /** ロックファイルのパス。 */
  path: string;
  /** この実行が記録したランダム ID (`LockRecord.id` と同じ値)。 */
  id: string;
};

/**
 * ソースファイルごとの内容ハッシュ (execution R-206)。
 *
 * キーはソースファイルのパス、値はその内容の決定的なハッシュ。実行前後の比較でソースの書き換えを検出する。
 */
export type SourceHashes = Record<string, string>;
