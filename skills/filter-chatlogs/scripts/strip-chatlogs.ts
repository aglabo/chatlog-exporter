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
import { findFilesFlat } from '../../_cle-libs/libs/file-ops/find-files.ts';
import { logger } from '../../_cle-libs/libs/io/logger.ts';
import { runConcurrent } from '../../_cle-libs/libs/parallel/concurrency.ts';
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
 * `stripped` は「書き換えた実績」、`skipped` は「dry-run のため見送った件数」であり、
 * 両者は排他になる（通常実行は `skipped=0`、dry-run は `stripped=0`）。
 *
 * ## バイト数の定義
 *
 * `bytesBefore` / `bytesAfter` は**除去対象と分類されたファイル**（通常実行は `stripped`、
 * dry-run は `skipped`）の**本文**（frontmatter を除く）UTF-8 バイト数の合計であり、
 * 対象ディレクトリ全体のサイズではない。除去を伴わない分類は本文バイト数を持たない
 * （`StripDecision.contentBytes` の JSDoc に算出不能である理由を記す）。
 * 除去対象が 1 件も無い実行では両者とも 0 になる。
 *
 * dry-run でも同じ値を出す。1 件ごとの明細は除去バイト数を出さないため（REQ-F-005）、
 * 「実行したらどれだけ縮むか」を事前に知る手段はこのサマリーだけである。
 *
 * `bytesBefore - bytesAfter` は `removedBytes` の合計であり、`removedBytes` は除去範囲
 * 最終行の行末終端子を含まないため、実ファイルの縮小量とは除去 1 件あたり 1 バイト異なる。
 *
 * SKILL.md 層が `::info::` 形式を解析する既存パターンに合わせ、`filter` / `noise-filter` と
 * 同じ `key=value` の羅列で出力する。桁区切り・単位は付けない（解析側が数値として読む）。
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
 * 実行と報告を分離し、`_reportRecovery` が結果の出力だけを担えるようにする。
 * dry-run も同じ経路に通す。件数の算出（特に `skipped`）を `recoverOrphans` の
 * 1 箇所へ集約するためであり、検出のみを別経路で呼ぶと「復帰しなかった件数」を導出できない。
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
 * 報告項目は復帰・スキップ・エラーの件数と、キャッシュ削除に失敗したパスであり、
 * REQ-F-006 の分類件数は出力しない。分類を行っていない以上、0 件のサマリーを出すと
 * 「全件が done だった」実行と区別がつかなくなるため。
 *
 * dry-run では `完了` を含む行を出さない。SKILL.md 層は `完了（復帰専用）:` の行から
 * 件数を拾うため、dry-run でも同じ語を出すと実行済みと誤読される。
 *
 * 復帰したパスの列挙は `recoverOrphans` が復帰の直後に行うため、ここでは再出力しない。
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
 * dry-run の判定内訳を 1 ファイル分だけ出力する（REQ-F-005）。
 *
 * 6000 件規模の事前レビューでは「どのファイルがどう扱われるか」が読み取れれば足りるため、
 * 出力はパスと判定結果に絞る。除去範囲・除去見込みバイト数は出力しない。
 * 6000 行が並ぶ明細では 1 行あたりの情報量よりも一覧性が優先され、行が長いほど読めなくなる。
 * 判定結果の `removalStartLine` / `removalEndLine` / `removedBytes` は
 * `writeStripped` が除去範囲として使う必須データであり、出力しないだけで保持は続く。
 *
 * dry-run で除去対象と判定されたファイル（`skipped`）は `stripped (skip)` と表示する。
 * 「本来 strip されるが dry-run のため見送った」ことを 1 語で表すためである。
 * `done` / `passthrough` / `error` には `(skip)` を付けない。これらは dry-run でも通常実行でも
 * 書き込みが起きず結果が変わらないため、付けると「見送られた」と誤読される。
 *
 * 判定理由（`rule=`）は `error` のときだけ添える。error は原因の特定を要する唯一の分類であり、
 * 他の分類では判定結果から規則が一意に定まるため、並べても行を伸ばすだけになる。
 *
 * 呼び出しは `_logFileOutcome` がファイル 1 件ごとに行う（`recoverOrphans` の `_logOutcome`
 * と同じ形）。dry-run か否かの判定は行わないため、dry-run 以外では呼ばれてはならない。
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
 * Phase 1: 孤立退避を検出し error として計上する（R-014 / DR-23 決定 1）。
 *
 * 孤立退避は `.md` を持たないため列挙されず R-002〜R-008 に到達しない。検出しないと
 * error 0 件のまま Phase 6 に到達し、一括削除で復旧材料の `.bak` が失われる。
 *
 * 検出結果を返さず `stats` へ加算するのは、後続フェーズが必要とするのが件数のみ
 * （R-011 の保持ゲートを駆動する error 件数）であり、パスは報告以外に使い道がないため。
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
 *
 * 分類の値域は判定と同じ `StripOutcome`（5 値）である。かつては同一内容の `_FileOutcome` を
 * 別途定義していたが、`classifyStrip` が dry-run を受け取り `skipped` まで判定するようになり
 * 両者が完全に一致したため、重複定義を解消した。
 */
interface _FileResult {
  /** 当該ファイルの判定結果（R-002〜R-008）。書き込みの成否では書き換えない。 */
  decision: StripDecision;
  /**
   * 判定と書き込みを合わせた最終的な分類。
   *
   * 判定（R-002〜R-008）が返す `done` / `error` / `skipped` はそのまま分類となる。
   * `stripped` と判定されたファイルは書き込みの成否で `stripped` / `error` に分かれ、
   * `passthrough` と判定されたファイルは（通常実行では）キャッシュ記録の成否で
   * `passthrough` / `error` に分かれる（DR-31 決定 3）。
   *
   * - `stripped` — 除去対象と判定され、書き込みも成功した
   * - `done` — 処理済み（R-003 / R-004）
   * - `passthrough` — 除去対象ではない（R-005 / R-006）
   * - `skipped` — 除去対象だが dry-run のため書き込みを見送った
   * - `error` — 判定が error（R-002 / R-007）、または書き込み・キャッシュ記録に失敗した
   *
   * `skipped` は「対象外」を意味しない。dry-run で「実行すれば何件 strip されるか」を
   * 示すのはこの分類であり、`StripStats.skipped` へ 1 対 1 で計上される（DR-30）。
   *
   * 判定の `stripped` と本分類の `stripped` は一致しない点に注意する。書き込みに失敗した
   * ファイルは判定が `stripped` のまま分類が `error` になる。`sweepBackups` へ渡すパス集合は
   * **判定** を基準とするため、本分類で絞り込んではならない（R-013 / DR-28 決定 5）。
   */
  outcome: StripOutcome;
  /** `error` 分類のうち、書き込み失敗の内容（判定 error では `undefined`）。 */
  error?: ChatlogError;
}

/**
 * `passthrough` と判定したファイルをキャッシュへ記録する（DR-31 決定 1・3・4）。
 *
 * 記録は `writeStripped` ではなくここで行う。`writeStripped` は退避・スワップ・記録を
 * 一連の手順として持ち、記録は最終スワップの成功後という順序制約を負うが、`passthrough` には
 * スワップが存在せずこの手順に乗らない。「除去して書き込む」責務の射程外である。
 *
 * 記録に失敗した場合は `error` へ倒す（決定 3）。`passthrough` は本体を変更しないため記録に
 * 失敗しても原文は無傷だが、`stripped` と扱いを変えると「記録に失敗したが成功として
 * 報告される」経路が生まれる。`error` に計上すれば R-011 により退避も保持され安全側に倒れる。
 *
 * `rule` は成立した規則（R-005 または R-006）をそのまま記録する。`R-003` で上書きしてはならない。
 * 元が `stripped` だったか `passthrough` だったかの区別が失われる。
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
 * （R-002〜R-009 / REQ-F-005 / DR-31）。
 *
 * 副作用の実行と分類のみを行い、ログ出力も件数加算も行わない。ログは `_logFileOutcome`、
 * 加算は `_applyFileOutcome` が担う。`recoverOrphans` の `_classifyRecovery` と同じ形である。
 *
 * 通常実行で副作用を伴う判定は 2 つある。`stripped` は本体を書き換えて記録し、
 * `passthrough` は本体を変更せず記録のみを行う（DR-31 決定 1・4）。それ以外
 * （`done` / `error` / dry-run の `skipped`）は判定の時点で確定しており副作用を持たない。
 * この早期 return が無いと、dry-run で判定 error のファイルまで `skipped` となり
 * `stats.skipped` を不当に押し上げる。
 *
 * dry-run の分岐をここに置くことで、「書き込んだか・見送ったか」の判断を 1 箇所へ集約する。
 * 呼び出し側は返された分類をログ関数と加算関数へ渡すだけでよく、
 * 分類規則・出力規則・加算規則が互いに混ざらない。
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
 * 1 ファイル分のログを出力する（REQ-F-005）。
 *
 * dry-run では判定結果の明細をちょうど 1 行出す。分類ではなく判定を基準とするため、
 * `stripped` 以外（`done` / `passthrough` / `error`）も等しく明細の対象となる
 * （`stripped` のみへ縮小すると 6000 件規模の事前レビューが成立しない）。
 * 分類ごとに追加の `logger.dryrun` を足してはならない。同一ファイルの明細行が二重に出る。
 *
 * 通常実行では書き込み失敗を error へ、`stripped` / `passthrough` のパスを info へ
 * 1 行ずつ出す。件数だけでは「どのファイルが書き換わったか」を事後に追えないため、
 * 今回の実行が触れた（あるいは対象外と判断した）ファイルを逐一報告する。
 *
 * error 行にも対象パスを出す。書き込み失敗の内容（`CacheWriteFailed` の detail 等）は
 * キャッシュ層の生メッセージであり chatlog のパスを含まないため、失敗内容だけでは
 * どのファイルが失敗したか特定できず、R-011 の退避保持ゲートを解除できない。
 *
 * `done` は出力しない。処理済み（R-003 / R-004）は今回の実行が何もしていない件であり、
 * 6000 件規模では大半を占めうるため、報告するとログが埋まって他の分類が読めなくなる。
 * 判定 error（R-002 / R-007）も出力せず、いずれも件数のみを Phase 7 のサマリーへ計上する。
 *
 * 分岐は **分類**（`outcome`）で行う。判定（`decision.outcome`）ではない。書き込みに失敗した
 * ファイルは判定が `stripped` のまま分類が `error` となるため、判定を見ると
 * 書き込めなかったファイルを `stripped` として報告してしまう。
 *
 * ラベルには分類の値をそのまま用いる。サマリー（`_reportSummary`）が出す `stripped=` /
 * `passthrough=` と同じ語になり、明細と件数を同じ語彙で読める。
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
  if (error) {
    logger.error(`${LOGGER_TEXT.INDENT}${outcome}: ${filePath} (${error.message})`);
    return;
  }
  // `skipped` は dry-run 専用の分類であり、この経路には到達しない
  if (outcome === 'stripped' || outcome === 'passthrough') {
    logger.info(`${LOGGER_TEXT.INDENT}${outcome}: ${filePath}`);
  }
};

/**
 * 分類結果を `StripStats` へ加算する。
 *
 * 分類（`StripOutcome` の 5 値）と件数フィールドは 1 対 1 に対応するため、
 * 同名のフィールドを加算するだけでよい（DR-30）。結果として
 * `total == stripped + skipped + done + passthrough + error` が成立する。
 *
 * `error` は `stripped` を加算しない。書き込みが成立していない以上 strip 済みではなく、
 * ここで加算すると R-013 の包含検査が「strip したのに退避が無い」と誤検出する。
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
 * 加算対象は**分類**が `stripped` / `skipped` のファイルのみである。判定ではない。
 * 書き込みに失敗したファイルは判定が `stripped` のまま分類が `error` となるが、本体は
 * 置換されておらず 1 バイトも除去されていないため、計上すると「実際には縮んでいない量」を
 * 除去実績として報告することになる。`sweepBackups` へ渡すパス集合が**判定**基準である
 * （R-013 / DR-28 決定 5）のとは基準が逆である点に注意する。
 *
 * 件数の加算（`_applyFileOutcome`）とは分けて持つ。件数は分類と 1 対 1 に対応するのに対し、
 * バイト数は 5 分類のうち 2 分類だけが値を持つ非対称な集計であり、同じ関数に混ぜると
 * 「分類名と同名のフィールドを加算するだけ」という件数側の単純さが失われる。
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
 * （R-002〜R-013 / REQ-F-005 / DR-28）。
 *
 * 1 ファイル単位へ統合した経緯と dry-run を内部で分岐させる理由は DR-28 と
 * `implementation/phase-design-note.md` Section 3.3 に記す。
 *
 * ## 観測される順序
 *
 * 1 件ごとに `_classifyFile`（分類）→ `_logFileOutcome`（ログ）→ `_applyFileOutcome`（加算）を
 * この順で呼ぶため、ログと `stats` 加算の順序は入力順ではなく**処理の完了順**になる。
 * 一方 `runConcurrent` は結果を入力位置へ書き戻すため、戻り値の `decisions` は
 * **入力と同順・同数**である。
 *
 * ## 守るべき不変条件
 *
 * - `sweepBackups` へ渡す `stats.error` は、孤立退避（Phase 1）・判定 error・書き込み失敗の
 *   3 者を含んだ**確定値**でなければならない。部分的な値を渡すと R-011 の保持ゲートが誤動作し、
 *   error があるにもかかわらず `.bak` を削除して復旧材料を失う。
 * - `sweepBackups` へ渡すパス集合は**判定**が `stripped` としたものであり、書き込みの成否で
 *   絞り込んではならない（理由は DR-28 決定 5）。
 * - dry-run の宣言行はループの外で 1 度だけ出す。内側に置くとファイル件数分重複し、
 *   かつ対象 0 件で消える。
 * - `sweepBackups` の error は throw せず返す。報告順序と終了コードの決定は `main` の責務
 *   （DD-03）。dry-run では常に `undefined` を返す。
 *
 * @param targetDir - 退避を探索する対象ディレクトリ
 * @param files - 判定・書き込み対象ファイルパスの一覧
 * @param stats - 5 分類を加算する統計カウンター。
 *   `error` は孤立退避（Phase 1）の計上を含み、そのまま R-011 の保持ゲートへ結線する
 * @param cache - 処理済み記録を参照・書き込むキャッシュ
 * @param deps - `main` に注入された依存
 * @param dryRun - 真なら書き込みも退避の一括削除も行わず、明細出力と計上のみ行う
 * @param concurrency - 同時実行する判定・書き込み処理の最大並列数（1 以上）
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
    { glob: deps.glob, removeProvider: deps.removeProvider },
  );
  return { decisions: _decisions, sweepError: _sweepError };
};

/**
 * Phase 0 受理ゲート（R-001）。受理範囲外の起動を列挙より前に拒否する。
 *
 * 未検証のデータセットへ 6000 件規模の破壊的書き換えが及ぶことを防ぐ安全弁であり、
 * 対象を `<agent> <YYYY-MM>` で明示した実行のみを受理する。閉じる経路は 3 つ。
 *
 * 1. `period` の省略 — `agentPath` が agent のみを返し、配下の全年月が対象になる
 * 2. `inputDir` の指定 — `resolveChatlogsDir` が agent / period を無視する。
 *    フラグ（`--input-dir`）だけでなく `/` を含む第 1 位置引数も同フィールドへ入るため、
 *    検査は解析後の `config.inputDir` に対して行う（AC-022）
 * 3. `outputDir` の指定 — strip は対象を in-place で書き換えるため出力先を持たない。
 *    共通 `parseArgs` は `--output-dir` と第 3 位置引数を同フィールドへ入れるが、
 *    `main` は値を一切使わない。黙って受理すると利用者は出力先を変えたつもりで
 *    `originalLogs/` を破壊的に書き換えることになるため、`inputDir` と同じく拒否する（AC-027）
 *
 * `period` の不正形式は共通 `parseArgs` が `InvalidPeriodPosition` で既に拒否済みのため、
 * ここでは扱わない。両モード（R-014 / R-015）で共通に評価する（DR-23 決定 5）。
 *
 * @param config - 解析済みの設定
 * @throws {ChatlogError} 受理範囲外の場合
 */
const _assertAcceptedRange = (config: StripConfig): void => {
  if (config.inputDir) {
    throw new ChatlogError(
      'InvalidArgs',
      'InputDirNotAllowed',
      `strip は入力ディレクトリの指定を受理しません（<agent> <YYYY-MM> で対象を明示してください）: ${config.inputDir}`,
    );
  }
  if (config.outputDir) {
    throw new ChatlogError(
      'InvalidArgs',
      'OutputDirNotAllowed',
      `strip は出力ディレクトリの指定を受理しません（<agent> <YYYY-MM> で対象を明示してください）: ${config.outputDir}`,
    );
  }
  if (!config.period) {
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

  // 対象は `export-chatlogs` が生成する `originalLogs/` 配下（specifications.md Section 5 Edge 15）。
  // `override` は R-001 が既に拒否済みのため常に未指定となる
  const _targetDir = resolveChatlogsDir({
    chatlogsDir: _config.chatlogsDir,
    agent: _config.agent,
    period: _config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
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

  // Phase 1: 列挙。strip は非再帰のため `findFilesFlat` を使う
  const _files = await findFilesFlat(_targetDir, { glob: deps.glob });

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
