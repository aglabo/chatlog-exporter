#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// src: scripts/strip-chatlogs.ts
// @(#): チャットログの定型部を除去するスクリプト（filter strip サブコマンド）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { resolveChatlogsDir } from '../../_cle-libs/libs/file-io/resolve-directory.ts';
import { findFiles } from '../../_cle-libs/libs/file-ops/find-files.ts';
import { logger } from '../../_cle-libs/libs/io/logger.ts';
import { runConcurrent } from '../../_cle-libs/libs/parallel/concurrency.ts';
import { getBasename } from '../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogCache } from '../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../_cle-libs/classes/ChatlogError.class.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../_cle-libs/constants/defaults.constants.ts';
import { LOGGER_TEXT } from '../../_cle-libs/constants/logger.constants.ts';

// ─── internal ───
// functions
import { buildConfig } from './configs/strip-config.ts';
import { classifyStrip } from './libs/classify-strip.ts';
import { validateChatlogsDir } from './libs/common-utils.ts';
import { findOrphans } from './modules/strip/find-orphans.ts';
import { recoverOrphans } from './modules/strip/recover-orphans.ts';
import { sweepBackups } from './modules/strip/sweep-backups.ts';
import { writeStripped } from './modules/strip/write-stripped.ts';
// constants
import { BAK_SUFFIX } from './constants/common.constants.ts';
import { STRIP_CACHE_STATUSES } from './types/strip-cache-status.const.types.ts';
// types
import type { RecoverOrphansResult } from './modules/strip/recover-orphans.ts';
import type { StripCache } from './types/cache.types.ts';
import type { RecoverStats, StripStats } from './types/stats.types.ts';
import type { StripConfig, StripMainDeps } from './types/strip-config.types.ts';
import type { StripDecision, StripOutcome } from './types/strip.types.ts';

// ─── constants ───

/** 既定の依存。実運用ではすべて実物（`undefined` は各関数の既定実装を意味する）。 */
const _DEFAULT_DEPS: StripMainDeps = {};

// ─── functions ───

/** 初期化済みの `StripStats` を返す。 */
const _makeStats = (): StripStats => ({
  total: 0,
  stripped: 0,
  skipped: 0,
  done: 0,
  passthrough: 0,
  error: 0,
  bytesBefore: 0,
  bytesAfter: 0,
});

/** 初期化済みの `RecoverStats` を返す（復帰専用モード用）。 */
const _makeRecoverStats = (): RecoverStats => ({ recovered: 0, skipped: 0, error: 0 });

/**
 * 5 分類の件数と除去前後の合計バイト数を 1 行のサマリーとして出力する（REQ-F-006 / DR-30）。
 *
 * 値の定義は REQ-F-006、書式は implementation/implementation.md 「`_reportSummary` — サマリー行の書式」節に記す。
 *
 * @param stats - 集計済みの統計カウンター
 * @param dryRun - dry-run 実行であれば接尾辞を付ける
 */
const _reportSummary = (stats: StripStats, dryRun: boolean): void => {
  const _suffix = dryRun ? ' (dry-run)' : '';
  logger.info(
    `\n完了${_suffix}: total=${stats.total} stripped=${stats.stripped} skipped=${stats.skipped}`
      + ` done=${stats.done} passthrough=${stats.passthrough} error=${stats.error}`
      + ` bytesBefore=${stats.bytesBefore} bytesAfter=${stats.bytesAfter}`,
  );
};

/**
 * 復帰専用モードを実行する（R-015 / DR-24 / DR-26）。
 *
 * 検出と復帰を同じ経路に通す理由は implementation/implementation.md
 * 「`_processRecovery` — 検出と復帰を同じ経路に通す理由」節に記す。
 *
 * @param targetDir - 復帰対象ディレクトリ
 * @param cache - 復帰したファイルのエントリを削除するキャッシュ
 * @param stats - `recoverOrphans` が件数を加算する統計カウンター
 * @param deps - `main` に注入された依存
 * @param dryRun - 真なら復帰を行わず復帰予定の報告にとどめる
 * @returns 復帰した本体パス・キャッシュ削除に失敗した本体パスの一覧
 */
const _processRecovery = (
  targetDir: string,
  cache: ChatlogCache<StripCache>,
  stats: RecoverStats,
  deps: StripMainDeps,
  dryRun: boolean,
): Promise<RecoverOrphansResult> =>
  recoverOrphans(targetDir, cache, stats, { glob: deps.glob, rename: deps.rename, dryRun });

/**
 * 復帰専用モードの実行結果を報告する（R-015 / DR-24 / DR-26）。
 *
 * 報告項目と dry-run での差は implementation/implementation.md
 * 「`_reportRecovery` — 復帰専用モードで dry-run に `完了` を出さない」節に記す。
 *
 * @param result - `recoverOrphans` の実行結果
 * @param stats - `recoverOrphans` が加算した件数の統計
 * @param dryRun - dry-run 実行であれば復帰対象の提示にとどめる
 */
const _reportRecovery = ({ errors }: RecoverOrphansResult, stats: RecoverStats, dryRun: boolean): void => {
  if (dryRun) {
    logger.info(`復帰対象: recovered=${stats.recovered} skipped=${stats.skipped} 件`);
    return;
  }
  logger.info(`\n完了（復帰専用）: recovered=${stats.recovered} skipped=${stats.skipped} error=${stats.error}`);
  // DR-24: 復帰は完了しているがキャッシュが乖離しており、次回実行で strip が漏れる
  errors.forEach((filePath) => logger.error(`${LOGGER_TEXT.INDENT}キャッシュ削除に失敗: ${filePath}`));
};

/**
 * dry-run の判定内訳を 1 ファイル分だけ出力する（REQ-F-005 / DR-29 決定 5）。
 *
 * 出力書式は specifications/specifications.md 「3.2 Output Semantics」節に記す。
 * dry-run か否かの判定は行わないため、dry-run 以外では呼ばれてはならない。
 *
 * @param filePath - 対象ファイルの絶対パス
 * @param decision - 当該ファイルの判定結果
 */
const _logDecisionDetail = (filePath: string, decision: StripDecision): void => {
  const { outcome, reason } = decision;
  const _label = outcome === 'skipped' ? 'stripped (skip)' : outcome;
  const _rule = outcome === 'error' ? ` rule=${reason.rule}` : '';
  logger.dryrun(`${filePath}: outcome=${_label}${_rule}`);
};

/**
 * Phase 1: 列挙結果に拡張子なしベース名の重複がないことを検査する（キャッシュキー衝突の防止）。
 *
 * `ChatlogCache` のキーは `getBasename` で得る拡張子なしベース名であり、別ディレクトリの
 * 同名ファイルは同一エントリを共有する。片方が `passthrough` を記録すると、もう片方は
 * 判定順序（R-003）で `done` と分類され一切検査されない。`runConcurrent` 下では実行順に
 * 依存し警告も出ないため、判定・書き込みへ進む前に fail-fast で中断する。
 *
 * @param files - 列挙されたファイルパス一覧
 * @throws ChatlogError ベース名が重複するファイルが 2 件以上ある場合
 */
const _assertUniqueBasenames = (files: string[]): void => {
  const _groups = files.reduce(
    (acc, filePath) => {
      const _basename = getBasename(filePath);
      return acc.set(_basename, [...(acc.get(_basename) ?? []), filePath]);
    },
    new Map<string, string[]>(),
  );
  const _collisions = [..._groups].filter(([, paths]) => paths.length > 1);
  if (_collisions.length === 0) { return; }

  // 衝突しているファイルは全パスを提示する。1 件でも欠けると利用者はどちらを
  // 改名すればよいか判断できない
  const _detail = _collisions
    .map(([basename, paths]) => `${basename} (${paths.join(', ')})`)
    .join('; ');
  throw new ChatlogError(
    'FailFast',
    'DuplicateBasename',
    `キャッシュキーとなるベース名が重複しています（${_collisions.length} 件）: ${_detail}`,
  );
};

/**
 * Phase 1: 孤立退避を検出し error として計上する（R-014 / DR-23 決定 1）。
 *
 * 検出結果を返さない理由は implementation/implementation.md
 * 「`_processOrphanErrors` — 検出結果を返さない理由」節に記す。
 *
 * @param targetDir - 走査対象ディレクトリ
 * @param stats - 孤立件数を加算する統計カウンター
 * @param deps - `main` に注入された依存
 */
const _processOrphanErrors = async (
  targetDir: string,
  stats: StripStats,
  deps: StripMainDeps,
): Promise<void> => {
  const _orphans = await findOrphans(targetDir, { glob: deps.glob });
  stats.error += _orphans.length;
  _orphans.forEach((filePath) =>
    logger.error(`${LOGGER_TEXT.INDENT}孤立した退避を検出しました: ${filePath}${BAK_SUFFIX}（本体なし: ${filePath}）`)
  );
};

/**
 * 1 ファイルの処理結果。判定は `sweepBackups` へ渡すパス集合の導出に用いる。
 */
interface _FileResult {
  /** 当該ファイルの判定結果（R-002〜R-008）。書き込みの成否では書き換えない。 */
  decision: StripDecision;
  /**
   * 判定と書き込みを合わせた最終的な分類（5 値の意味と規則との対応は
   * specifications/specifications.md 「3.2 Output Semantics」節、件数フィールドとの対応は DR-30。
   * 判定の `stripped` と本分類の `stripped` は一致しない — R-013 / DR-28 決定 5）。
   */
  outcome: StripOutcome;
  /** `error` 分類のうち、書き込み失敗の内容（判定 error では `undefined`）。 */
  error?: ChatlogError;
}

/**
 * `passthrough` と判定したファイルをキャッシュへ記録する（DR-31 決定 1・3・4）。
 *
 * @param filePath - 対象ファイルの絶対パス
 * @param decision - `outcome: 'passthrough'` の判定結果
 * @param cache - 記録先のキャッシュ
 * @returns 記録に成功すれば分類 `passthrough`、失敗すれば分類 `error` と失敗内容
 */
const _recordPassthrough = async (
  filePath: string,
  decision: StripDecision,
  cache: ChatlogCache<StripCache>,
): Promise<_FileResult> => {
  try {
    await cache.write(filePath, {
      status: STRIP_CACHE_STATUSES.PASSTHROUGH,
      rule: decision.reason.rule,
    });
  } catch (e) {
    const _error = e instanceof ChatlogError ? e : new ChatlogError('FailFast', 'CacheWriteFailed', String(e));
    return { decision, outcome: 'error', error: _error };
  }
  return { decision, outcome: 'passthrough' };
};

/**
 * 1 ファイルを判定し、副作用（本体の書き込み・キャッシュ記録）まで行って結果を分類する
 * （R-002〜R-009 / DR-31）。ログ出力と件数加算は行わない。
 *
 * 書き込み経路へ入れる条件は implementation/implementation.md
 * 「`_classifyFile` — 書き込み経路へ入れるのは判定 `stripped` のみ」節に記す。
 *
 * @param filePath - 対象ファイルの絶対パス
 * @param cache - R-003 の処理済み記録を参照し、`stripped` の書き込み成功時および
 *   `passthrough` の判定時（通常実行のみ）に記録するキャッシュ
 * @param dryRun - 真なら本体への書き込みもキャッシュ記録も行わない
 * @returns 判定結果・分類と、書き込み・記録に失敗した場合はその内容
 */
const _classifyFile = async (
  filePath: string,
  cache: ChatlogCache<StripCache>,
  dryRun: boolean,
): Promise<_FileResult> => {
  const _decision = await classifyStrip(filePath, cache, dryRun);

  // `passthrough` は本体を変更しないが、判定が確定した記録としてキャッシュへ残す（DR-31 決定 1・4）。
  // 記録しないと次回実行が同じファイルを読み直して再判定する。dry-run では記録しない（決定 5）
  if (_decision.outcome === 'passthrough' && !dryRun) {
    return _recordPassthrough(filePath, _decision, cache);
  }

  // 本体への書き込みを要するのは `stripped` のみ。他の分類（`done` / `error` /
  // dry-run の `skipped`）は判定の時点で確定しており、書き込み経路へ入らない
  if (_decision.outcome !== 'stripped') { return { decision: _decision, outcome: _decision.outcome }; }

  const _error = await writeStripped(filePath, _decision, cache);
  return _error === undefined
    ? { decision: _decision, outcome: 'stripped' }
    : { decision: _decision, outcome: 'error', error: _error };
};

/**
 * 1 ファイル分のログを出力する（REQ-F-005 / REQ-F-006 / DR-29 決定 5・6 / DR-37）。
 *
 * 出力対象と書式は specifications/specifications.md 「3.2 Output Semantics」節、
 * error 行にパスを出す理由と分岐を分類で行う理由は implementation/implementation.md の
 * 「`_logFileOutcome` — error 行に対象パスを出す理由」「`_logFileOutcome` — 分岐を分類で行う理由」
 * の 2 節に記す。
 *
 * @param filePath - 対象ファイルの絶対パス
 * @param result - 当該ファイルの判定結果・分類・書き込み失敗の内容
 * @param dryRun - 真なら判定明細を出力し、通常実行用のログは一切出さない
 */
const _logFileOutcome = (filePath: string, { decision, outcome, error }: _FileResult, dryRun: boolean): void => {
  if (dryRun) {
    _logDecisionDetail(filePath, decision);
    return;
  }
  if (outcome === 'error') {
    const _detail = error?.message ?? `rule=${decision.reason.rule}`;
    logger.error(`${LOGGER_TEXT.INDENT}${outcome}: ${filePath} (${_detail})`);
    return;
  }
  // `skipped` は dry-run 専用の分類であり、この経路には到達しない
  if (outcome === 'stripped' || outcome === 'passthrough') {
    logger.info(`${LOGGER_TEXT.INDENT}${outcome}: ${filePath}`);
  }
};

/**
 * 分類結果を `StripStats` へ加算する（DR-30 決定 2）。
 *
 * 加算規則と実行終了時の不変条件は implementation/implementation.md
 * 「`_applyFileOutcome` — 加算は 1 ファイルにつき 1 フィールド」節に記す。
 *
 * @param outcome - 加算対象の分類
 * @param stats - 更新する統計カウンター
 */
const _applyFileOutcome = (outcome: StripOutcome, stats: StripStats): void => {
  switch (outcome) {
    case 'stripped':
      stats.stripped++;
      break;
    case 'skipped':
      stats.skipped++;
      break;
    case 'done':
      stats.done++;
      break;
    case 'passthrough':
      stats.passthrough++;
      break;
    case 'error':
      stats.error++;
      break;
  }
};

/**
 * 除去前後のバイト数を `StripStats` へ加算する（REQ-F-006）。
 *
 * 加算対象と、件数の加算（`_applyFileOutcome`）と分けて持つ理由は implementation/implementation.md
 * 「`_applyFileOutcome` と `_applyFileBytes` を分けて持つ理由」節に記す。
 *
 * @param outcome - 当該ファイルの分類
 * @param decision - 当該ファイルの判定結果（本文バイト数と除去バイト数を担う）
 * @param stats - 更新する統計カウンター
 */
const _applyFileBytes = (outcome: StripOutcome, decision: StripDecision, stats: StripStats): void => {
  if (outcome !== 'stripped' && outcome !== 'skipped') { return; }
  stats.bytesBefore += decision.contentBytes;
  stats.bytesAfter += decision.contentBytes - decision.removedBytes;
};

/**
 * Phase 2〜6: 1 ファイル単位のパイプラインで判定・書き込みを行い、退避を一括削除する
 * （R-002〜R-013 / DR-28）。
 *
 * 1 ファイル単位へ統合した経緯は DR-28 と `implementation/phase-design-note.md` Section 3.3、
 * 観測される順序と守るべき不変条件は implementation/implementation.md の
 * 「`_processFiles` — 観測される順序」「`_processFiles` — 守るべき不変条件」の 2 節に記す。
 *
 * @param targetDir - 退避を探索する対象ディレクトリ
 * @param files - 判定・書き込み対象ファイルパスの一覧
 * @param stats - 5 分類を加算する統計カウンター。
 *   `error` は孤立退避（Phase 1）の計上を含み、そのまま R-011 の保持ゲートへ結線する
 * @param cache - 処理済み記録を参照・書き込むキャッシュ
 * @param deps - `main` に注入された依存
 * @param dryRun - 真なら書き込みも退避の一括削除も行わず、明細出力と計上のみ行う
 * @param concurrency - 同時実行する判定・書き込み処理および退避の一括削除の最大並列数（1 以上）
 * @returns ファイルパスと判定結果のペアの一覧（入力と同順・同数）と、
 *   退避不足または削除失敗があれば `ChatlogError`
 */
const _processFiles = async (
  targetDir: string,
  files: string[],
  stats: StripStats,
  cache: ChatlogCache<StripCache>,
  deps: StripMainDeps,
  dryRun: boolean,
  concurrency: number,
): Promise<{ decisions: { filePath: string; decision: StripDecision }[]; sweepError?: ChatlogError }> => {
  // 宣言は繰り返さず、対象が 0 件でも 1 度だけ出す（ループの内側に置くと件数分重複する）
  if (dryRun) { logger.dryrun('ファイルへの書き込み・退避・キャッシュ記録を一切行いません'); }

  // Phase 2〜5: ファイルごとに「分類 → ログ → 加算」を完結させる。
  // ログと加算はそのファイルの処理が終わった時点で行うため、観測される順序は完了順になる
  const _decisions = await runConcurrent(files, async (filePath) => {
    const _result = await _classifyFile(filePath, cache, dryRun);
    _logFileOutcome(filePath, _result, dryRun);
    _applyFileOutcome(_result.outcome, stats);
    _applyFileBytes(_result.outcome, _result.decision, stats);
    return { filePath, decision: _result.decision };
  }, concurrency);

  // Phase 6: 退避の一括削除（R-010〜R-013）。孤立退避を含む error 件数を保持ゲートへ結線する。
  // dry-run はディレクトリ単位のこの処理をループ内で選べないため、ここで抑止する
  if (dryRun) { return { decisions: _decisions }; }

  const _sweepError = await sweepBackups(
    targetDir,
    // 判定が stripped としたパス。書き込みの成否では絞り込まない（DR-28 決定 5）。
    //
    // **この基準はテストで守れない。レビューで守ること。** 書き込み失敗は
    // `_applyFileOutcome` が `stats.error` を立てるため、`sweepBackups` は R-011 の
    // 保持ゲート（errorCount > 0）で戻り、`strippedPaths` を消費する R-013 の包含検査へ
    // 到達しない。したがって「判定基準」と「分類基準」は観測上区別できず、
    // `_result.outcome` へ「単純化」しても全テストが通ってしまう。
    _decisions.filter(({ decision }) => decision.outcome === 'stripped').map(({ filePath }) => filePath),
    stats.error,
    concurrency,
    { glob: deps.glob, removeProvider: deps.removeProvider },
  );
  return { decisions: _decisions, sweepError: _sweepError };
};

/**
 * Phase 0 受理ゲート（R-001 / DR-32 / DR-23 決定 5）。受理範囲外の起動を列挙より前に拒否する。
 *
 * 拒否する 2 条件と評価順序は specifications/specifications.md 「4.1 実行単位の規則」節、
 * 受理範囲は AC-021 / AC-022 / AC-027 に記す。
 *
 * - 出力先の指定（`--output-dir` / 第 3 位置引数）は受理しない。strip は対象を直接書き換えるため
 * - 年月の省略は受理しない。ただし `--input-dir` で対象ディレクトリが明示されている場合は、
 *   agent / period を対象の解決に使わないため年月を要求しない
 *
 * @param config - 解析済みの設定
 * @throws {ChatlogError} 受理範囲外の場合
 */
const _assertAcceptedRange = (config: StripConfig): void => {
  if (config.outputDir) {
    throw new ChatlogError(
      'InvalidArgs',
      'OutputDirNotAllowed',
      `strip は出力ディレクトリの指定を受理しません（<agent> <YYYY-MM> で対象を明示してください）: ${config.outputDir}`,
    );
  }
  if (!config.inputDir && !config.period) {
    throw new ChatlogError(
      'InvalidArgs',
      'PeriodRequired',
      'strip は年月の指定を必須とします（例: claude 2026-03）',
    );
  }
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (
  argv?: string[],
  deps: StripMainDeps = _DEFAULT_DEPS,
): Promise<void> => {
  const _config = buildConfig(argv ?? Deno.args);

  // Phase 0: 受理ゲート。列挙・キャッシュ初期化を含む一切の I/O より前に評価する（R-001）
  _assertAcceptedRange(_config);

  // 既定の対象は `export-chatlogs` が生成する `originalLogs/` 配下（specifications.md Section 5 Edge 15）。
  // `--input-dir`（および位置引数のパス）が与えられた場合は他スキルと同じくそれを対象とし、
  // agent / period による解決を行わない
  const _targetDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: _config.inputDir,
  });

  // Phase 0: 対象ディレクトリの存在確認。存在しない対象を走査すると件数 0 のサマリーと
  // 終了コード 0 になり、「本当に対象が無かった実行」と打ち間違いを区別できなくなる。
  // 両モード共通の失敗であるため復帰専用モードの分岐より前、かつ列挙・キャッシュ初期化より前に置く
  await validateChatlogsDir(_targetDir);

  // Phase 1: キャッシュ初期化。両モードが使うため列挙より前に置く
  const _cache = new ChatlogCache<StripCache>(
    'strip-cache',
    deps.cacheRoot ?? '',
    undefined,
    deps.cacheProviders,
  );
  await _cache.ready;

  // 復帰専用モード（R-015）: Phase 0 → 復帰 → Phase 7 で終了する。
  // 実行フェーズ 2〜6 を呼ばないことで「strip を行わない」ことを構造として保証する
  // （フェーズ関数の内部に `if (recoverOrphans)` を置かない。dry-run と同じ方針）。
  // 通常モードの孤立退避 error 計上（R-014）とは排他であり、ここでは計上しない
  if (_config.recoverOrphans) {
    // dry-run 併用時も同じ経路を通す。復帰させず対象件数とパスの報告にとどめる判断は
    // `recoverOrphans` が担い、件数の算出を 1 箇所へ集約する
    const _recoverStats = _makeRecoverStats();
    const _result = await _processRecovery(_targetDir, _cache, _recoverStats, deps, _config.dryRun);
    _reportRecovery(_result, _recoverStats, _config.dryRun);

    // DR-33: 復帰の error（キャッシュ削除失敗・復帰リネーム失敗）は非成功終了させる。報告を
    // 出した後に throw する形は通常モードの sweep 失敗と同じであり、DR-20 決定 3（報告は
    // 終了コードの生成に先行する）に従う。dry-run のガードは置かない。dry-run では
    // `_classifyRecovery` がリネームもキャッシュ削除も行わず `skipped` を返すため error に到達しない
    if (_recoverStats.error > 0) {
      throw new ChatlogError(
        'FailFast',
        'OrphanRecoveryFailed',
        `orphan recovery failed (${_recoverStats.error}): 復帰またはキャッシュ削除に失敗しました`,
      );
    }
    return;
  }

  // Phase 1: 列挙。classify-chatlogs がログをプロジェクト別サブディレクトリへ移動するため、
  // 直下だけでは対象に到達できない。`findFiles` でサブツリー全体を再帰的に列挙する
  const _files = await findFiles(_targetDir, { glob: deps.glob });

  // Phase 1: キャッシュキー衝突の検査。判定・書き込み・キャッシュ記録のいずれよりも前に評価する
  _assertUniqueBasenames(_files);

  const _stats = _makeStats();
  _stats.total = _files.length;
  logger.info(`対象ファイル数: ${_stats.total}`);

  // Phase 1: 孤立退避を error として計上する（R-014 / DR-23 決定 1）
  await _processOrphanErrors(_targetDir, _stats, deps);

  // Phase 2〜6: 判定・書き込みを 1 ファイル単位のパイプラインで実行し、退避を一括削除する
  // （R-002〜R-013 / DR-28）。dry-run でも経路を分けず常に呼ぶ。書き込むか否かは
  // `_processFiles` が 1 ファイルごとに選択する（同関数の JSDoc に方針からの逸脱理由を記す）
  const { sweepError: _sweepError } = await _processFiles(
    _targetDir,
    _files,
    _stats,
    _cache,
    deps,
    _config.dryRun,
    _config.concurrency,
  );
  if (_sweepError) {
    _reportSummary(_stats, _config.dryRun);
    throw _sweepError;
  }

  // Phase 7: サマリー報告（REQ-F-006）
  _reportSummary(_stats, _config.dryRun);
};

// ─────────────────────────────────────────────
// テスト用 export
// ─────────────────────────────────────────────

// テスト専用の公開であり、本番コードから import してはならない。
export { _logDecisionDetail, _processFiles, _processOrphanErrors };

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
}
