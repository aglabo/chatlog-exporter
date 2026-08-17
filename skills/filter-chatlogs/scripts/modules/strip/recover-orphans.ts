// src: scripts/modules/strip/recover-orphans.ts
// @(#): strip 復帰専用モード（R-015: .bak を本体名へ復帰 / DR-24: キャッシュ削除 / DR-26）
//       対象: recoverOrphans
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { logger } from '../../../../_cle-libs/libs/io/logger.ts';
// classes
import type { ChatlogCache } from '../../../../_cle-libs/classes/ChatlogCache.class.ts';
// constants
import { LOGGER_TEXT } from '../../../../_cle-libs/constants/logger.constants.ts';
// types
import type { GlobProvider, RenameProvider, SleepProvider } from '../../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// functions
import { findOrphans } from './find-orphans.ts';
// constants
import { BAK_SUFFIX } from '../../constants/common.constants.ts';
import {
  STRIP_CACHE_DELETE_ATTEMPTS,
  STRIP_CACHE_DELETE_RETRY_WAIT_MS,
} from '../../constants/strip.constants.ts';
// types
import type { StripCache } from '../../types/cache.types.ts';
import type { RecoverStats } from '../../types/stats.types.ts';

// ─── constants ───

/** 復帰リネームのデフォルト実装。テスト時は `options.rename` で差し替える。 */
const _defaultRename: RenameProvider = (oldPath: string, newPath: string) => Deno.rename(oldPath, newPath);

/** 待機のデフォルト実装。テスト時は `options.sleep` で差し替え、実待機を避ける。 */
const _defaultSleep: SleepProvider = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── types ───

/**
 * 孤立退避 1 件を処理した結果の分類。
 *
 * - `recovered` — リネームが成立し、キャッシュ削除も成功した
 * - `skipped` — dry-run のため復帰を行わなかった（復帰「予定」として扱う）
 * - `error` — リネームは成立したがキャッシュ削除に失敗した（DR-24）
 * - `failed` — 復帰リネーム自体に失敗し、復帰が成立しなかった
 *
 * `failed` だけは復帰が成立していないため、唯一 `recovered` を加算しない分類である。
 *
 * ## 分類が排他 4 値でも `recovered` 件数が減らない理由（`failed` を除く）
 *
 * `RecoverStats` の `recovered` は「復帰が成立した（または成立予定の）全件」を表し、
 * `skipped` / `error` はそれに直交する**限定子**である。したがって `error` は
 * 「復帰しなかった」ことを意味せず、`skipped` も「対象外」を意味しない。
 * この 3 分類はいずれも `stats.recovered` を加算し、`skipped` / `error` のみを
 * 分類に応じて上乗せする（詳細は `_applyOutcome`）。
 * `failed` のみは復帰が成立していないため `stats.error` だけを加算する。
 */
type _RecoverOutcome = 'recovered' | 'skipped' | 'error' | 'failed';

/**
 * 孤立退避 1 件の処理結果。復帰の成否によらず本体パスを保持する。
 *
 * `error` の場合も復帰そのものは成立しているため、`RecoverOrphansResult.recovered`
 * にはこの `filePath` が含まれる（`errors` にも重複して現れる）。
 * `failed` の場合のみ復帰が成立しておらず、`recovered` に含まれない。
 */
interface _RecoverEntry {
  /** 復帰した（dry-run では復帰予定の）本体パス。 */
  filePath: string;
  /** 当該ファイルの処理結果の分類。 */
  outcome: _RecoverOutcome;
}

/**
 * 復帰専用モードの実行結果。
 *
 * 復帰と失敗の 2 つの一覧として返し、報告と終了コードの判断は
 * 呼び出し側（main）の責務とする。孤立退避の定義が `.bak` の存在を前提とするため
 * （DR-26）、復帰元を持たないことを理由とする「非復帰」の分類は存在しない。
 * 復帰元を持ちながらリネームに失敗した件は `recovered` に含めず、`stats.error` へ計上する
 * （パスの報告は失敗した時点で error チャネルへ出す。DR-26 決定 2 の報告項目は増やさない）。
 *
 * dry-run では復帰を行わないため、`recovered` は復帰「予定」パスの一覧となり、
 * 呼び出し側が渡した `RecoverStats` の `skipped` が同数で立つ。
 *
 * 件数は本結果に含めず、引数で受け取った `RecoverStats` へ加算する
 * （`writeStripped` と同じ方式。引数と戻り値の二重管理を避けるため）。
 */
export interface RecoverOrphansResult {
  /** 復帰した本体パス（`<name>.md`）の一覧。dry-run では復帰「予定」パスの一覧。 */
  recovered: string[];
  /** 復帰後のキャッシュ削除に失敗した本体パスの一覧（DR-24）。dry-run では常に空。 */
  errors: string[];
}

// ─── functions ───

/**
 * 復帰したファイルのキャッシュエントリを削除する（DR-24）。
 *
 * 削除しないと次回実行が判定順序の手順 1（R-003 の処理済み記録）で done と誤判定し、
 * 定型部が恒久的に残る。エントリが存在しない場合は `ChatlogCache.delete` が
 * `Deno.errors.NotFound` を握り潰すため no-op として成功する（中断点によっては未記録のため正常）。
 *
 * 失敗時は `STRIP_CACHE_DELETE_ATTEMPTS` 回まで再試行する。主因はウイルススキャナや
 * エディタによる一時的なファイルロックであり、短い待機を挟めば解ける場合があるため。
 * 待機なしの再試行はロックがまず解けず効果がないので、試行と試行の間に必ず
 * `STRIP_CACHE_DELETE_RETRY_WAIT_MS` の待機を挟む（最終試行の後には待機しない）。
 *
 * `ChatlogCache.delete` はメモリ上のエントリ削除を先に済ませてからファイルを消すため
 * （ChatlogCache.class.ts:277）、再呼び出しは冪等であり再試行しても副作用を持たない。
 *
 * @param filePath - 復帰した本体パス（キャッシュキーは `getBasename` により `<name>` になる）
 * @param cache - 削除対象のキャッシュ
 * @param sleep - 再試行前の待機（テスト用注入）
 * @param attemptsLeft - 残り試行回数。既定は `STRIP_CACHE_DELETE_ATTEMPTS`
 * @returns 全試行が失敗した場合は当該パス、成功した場合は `undefined`
 */
const _deleteCacheEntry = async (
  filePath: string,
  cache: ChatlogCache<StripCache>,
  sleep: SleepProvider,
  attemptsLeft: number = STRIP_CACHE_DELETE_ATTEMPTS,
): Promise<string | undefined> => {
  try {
    await cache.delete(filePath);
    return undefined;
  } catch (e) {
    if (attemptsLeft > 1) {
      await sleep(STRIP_CACHE_DELETE_RETRY_WAIT_MS);
      return _deleteCacheEntry(filePath, cache, sleep, attemptsLeft - 1);
    }
    logger.error(`${LOGGER_TEXT.INDENT}キャッシュ削除に失敗しました: ${filePath} — ${(e as Error).message}`);
    return filePath;
  }
};

/**
 * 孤立退避 1 件を復帰させ、その結果を分類する（副作用の実行と分類のみ）。
 *
 * ログ出力も件数加算も行わない。ログは `_logOutcome`、加算は `_applyOutcome` が担う。
 *
 * dry-run の分岐をここに置くことで、「復帰したか・しなかったか」の判断を 1 箇所へ集約する。
 * 呼び出し側は返された分類をログ関数と加算関数へ渡すだけでよく、
 * 分類規則・出力規則・加算規則が互いに混ざらない。
 *
 * キャッシュ削除失敗のログのみは例外的に `_deleteCacheEntry` が出す。再試行の
 * **最終試行でのみ**出す必要があり、分類だけを見る `_logOutcome` からは
 * 「何回目の試行で失敗したか」を判別できないためである。
 *
 * @param filePath - 復帰対象の本体パス（`<name>.md`）
 * @param cache - 復帰後にエントリを削除するキャッシュ
 * @param rename - 復帰リネーム
 * @param sleep - キャッシュ削除の再試行前の待機
 * @param dryRun - true なら復帰を行わず予定のみを報告する
 * @returns 当該ファイルの処理結果の分類（リネーム失敗は `failed`）
 */
const _classifyRecovery = async (
  filePath: string,
  cache: ChatlogCache<StripCache>,
  rename: RenameProvider,
  sleep: SleepProvider,
  dryRun: boolean,
): Promise<_RecoverOutcome> => {
  if (dryRun) { return 'skipped'; }

  // リネーム失敗を捕捉して failed に落とす。伝播させると 1 件のロックが Promise.all 全体を
  // reject させ、既に復帰した他ファイルの集計行も呼び出し側の報告も出なくなる
  try {
    await rename(`${filePath}${BAK_SUFFIX}`, filePath);
  } catch (e) {
    logger.error(`${LOGGER_TEXT.INDENT}復帰に失敗しました: ${filePath} — ${(e as Error).message}`);
    return 'failed';
  }

  // 復帰は成立しているため、キャッシュ削除の失敗は error 分類にとどめる（DR-24）
  const _cacheError = await _deleteCacheEntry(filePath, cache, sleep);
  return _cacheError === undefined ? 'recovered' : 'error';
};

/**
 * 分類結果に対応する 1 件分のログを出力する。
 *
 * `recovered` と `error` はいずれも**同じ復帰報告行**を出す。`error` はキャッシュが
 * 乖離しただけで復帰そのものは成立しており（`_RecoverOutcome` の JSDoc 参照）、
 * 復帰した事実は利用者へ等しく報告しなければならないためである。
 * 乖離の詳細は `_deleteCacheEntry` が error チャネルへ別途出す。
 *
 * `failed` はここでは何も出さない。復帰が成立していない以上、復帰報告行を出してはならず、
 * 失敗の詳細は `_classifyRecovery` が失敗した時点で error チャネルへ出しているためである
 * （キャッシュ削除失敗を `_deleteCacheEntry` が自ら出すのと同じ形）。
 *
 * 全件処理後の集計行（`復帰: N 件`）と dry-run の宣言行は 1 件分のログではないため、
 * ここではなく `recoverOrphans` が出す。
 *
 * @param filePath - 復帰した（dry-run では復帰予定の）本体パス
 * @param outcome - 当該ファイルの処理結果の分類
 */
const _logOutcome = (filePath: string, outcome: _RecoverOutcome): void => {
  if (outcome === 'failed') { return; }
  if (outcome === 'skipped') {
    logger.dryrun(`${filePath}${BAK_SUFFIX} → ${filePath}`);
    return;
  }
  logger.info(`${LOGGER_TEXT.INDENT}復帰しました: ${filePath}`);
};

/**
 * 分類結果を `RecoverStats` へ加算する（DR-24）。
 *
 * `recovered` は `failed` を除くいずれの分類でも加算する。`recovered` が表すのは
 * 「復帰が成立した（dry-run では成立予定の）全件」であり、`skipped` / `error` は
 * それに直交する限定子だからである（`_RecoverOutcome` の JSDoc 参照）。
 * とくに `error` はキャッシュが乖離しただけで復帰自体は完了しているため、
 * ここで `recovered` を加算しないと復帰件数が実態より少なく報告される。
 *
 * @param outcome - 加算対象の分類
 * @param stats - 更新する統計カウンター
 */
const _applyOutcome = (outcome: _RecoverOutcome, stats: RecoverStats): void => {
  switch (outcome) {
    case 'recovered':
      stats.recovered++;
      break;
    case 'skipped':
      // 復帰「予定」件数は実行時の recovered と一致させる必要があるため recovered も立てる
      stats.recovered++;
      stats.skipped++;
      break;
    case 'error':
      // 復帰は成立しているため recovered にも計上し、キャッシュの乖離のみを error とする
      stats.recovered++;
      stats.error++;
      break;
    case 'failed':
      // 復帰そのものが成立していない唯一の分類。recovered は加算しない
      stats.error++;
      break;
  }
};

/**
 * 孤立退避を本体名へ復帰させる（R-015 手順 2〜3 / DR-23 / DR-24 / DR-26）。
 *
 * 孤立退避は `<name>.md` が存在せず `<name>.md.bak` が存在する状態と定義されるため
 * （DR-26）、検出されたすべての孤立が復帰対象となる。復帰元のパスは本体パスから
 * `` `${filePath}${BAK_SUFFIX}` `` で構成する。
 *
 * `.tmp` は検出にも復帰にも関与しない。`.bak` と `.tmp` が併存する場合、`.tmp` は
 * 参照されないまま残置される（削除は R-015 の射程外）。
 *
 * 復帰リネームの成功直後にキャッシュエントリを削除する（DR-24）。削除に失敗した場合は
 * 復帰が完了していてもキャッシュが乖離したままとなり、次回実行で strip が漏れるため
 * error として計上しパスを報告する。
 *
 * キャッシュ削除も復帰リネームも、1 件の失敗が他の復帰を止めないよう
 * ファイルごとに独立して完結させる。リネームに失敗した件は復帰件数に数えず
 * `stats.error` へ計上し、パスを error チャネルへ報告する。伝播させると
 * `Promise.all` 全体が reject し、既に復帰した他ファイルの集計行も
 * 呼び出し側の完了報告（DR-26 決定 2）も出せなくなるためである。
 * strip の判定・書き込みは一切行わない。
 *
 * ## dry-run を関数内部で分岐させる理由
 *
 * `dryRun` は呼び出し側の経路分岐ではなく本関数の内部で見る。復帰専用モードは
 * 復帰・スキップ・エラーの統計を 1 箇所へ集約する必要があり、検出（`findOrphans`）だけを
 * 別経路で呼ぶ従来の実装では「復帰しなかった件数（skipped）」を導出できないためである。
 * 別経路への差し戻しは `skipped` の算出根拠を失わせる。
 *
 * strip 側の `_processFiles`（strip-chatlogs.ts）も同じく 1 件ごとに dry-run を判定する形へ
 * 揃えてあり、両モードで構造が一致する。
 *
 * 分岐は 1 件ごとの分類関数（`_classifyRecovery`）に置き、復帰したか否かの判断を
 * そこへ集約する。本関数が `dryRun` を直接見るのは、繰り返してはならない宣言ログと、
 * 復帰実績を表す集計行（`復帰: N 件`）を dry-run で出さないための抑止のみである。
 *
 * dry-run ではリネームもキャッシュ削除も行わず、`recovered` には復帰「予定」パスを積む。
 * 実行前レビューの手段として、この件数は実行時の `recovered` と一致しなければならない。
 *
 * 責務は 1 件あたり 3 つの関数へ分かれる。`_classifyRecovery` が副作用の実行と分類、
 * `_logOutcome` がログ出力、`_applyOutcome` が件数加算を担い、これらを 1 件ずつ
 * この順で呼ぶ。
 *
 * ファイルをまたぐ処理は**並行させる**（`Promise.all` + `map`）。キャッシュ削除は再試行と
 * 待機を伴うため、直列化すると 1 件のロックが後続すべてを待たせる。ファイル間で並行させて
 * 性能を優先するのがユーザーの明示的な決定である。
 *
 * その結果、各件の `復帰しました:` は孤立一覧の順序ではなく**処理の完了順**で出力される
 * （キャッシュ削除が再試行に入ったファイルは後ろへ回る）。`stats` への加算順序も同様である。
 * 保証されるのは、集計行（`復帰: N 件`）が全件の完了後に出ること、すなわち
 * いずれの `復帰しました:` よりも後に出ることのみである（T-FL-SEP-04-18）。
 *
 * なお `Promise.all` は入力配列の位置を保つため、戻り値の `recovered` / `errors` と
 * 集計行の件数は完了順の影響を受けず、孤立一覧の順序のままとなる。
 *
 * `recovered` は `failed` を除く 3 分類で加算され、`skipped` / `error` は直交する限定子として
 * 上乗せされる。
 *
 * @param targetDir - 復帰対象ディレクトリ
 * @param cache - 復帰したファイルのエントリを削除するキャッシュ
 * @param stats - 更新する統計カウンター（復帰・スキップ・エラーをその場で加算する）
 * @param options - `glob`（孤立の検出）、`rename`（復帰リネーム）、`sleep`（再試行待機）の
 *   テスト用注入と、`dryRun`（復帰を行わず予定のみを報告する）
 * @returns 復帰した本体パス・キャッシュ削除に失敗した本体パスの一覧
 */
export const recoverOrphans = async (
  targetDir: string,
  cache: ChatlogCache<StripCache>,
  stats: RecoverStats,
  options?: { glob?: GlobProvider; rename?: RenameProvider; sleep?: SleepProvider; dryRun?: boolean },
): Promise<RecoverOrphansResult> => {
  const _rename = options?.rename ?? _defaultRename;
  const _sleep = options?.sleep ?? _defaultSleep;
  const _dryRun = options?.dryRun ?? false;
  const _orphans = await findOrphans(targetDir, { glob: options?.glob });

  // 宣言は繰り返さず、孤立が 0 件でも 1 度だけ出す（map の内側に置くと件数分重複する）
  if (_dryRun) { logger.dryrun('復帰リネーム・キャッシュ削除を一切行いません'); }

  // ファイルごとに「分類 → ログ → 加算」を完結させ、全件を並行して走らせる。
  // ログと加算はそのファイルの処理が終わった時点で行うため、観測される順序は完了順になる
  const _results: _RecoverEntry[] = await Promise.all(
    _orphans.map(async (filePath) => {
      const _outcome = await _classifyRecovery(filePath, cache, _rename, _sleep, _dryRun);
      _logOutcome(filePath, _outcome);
      _applyOutcome(_outcome, stats);
      return { filePath, outcome: _outcome };
    }),
  );

  // error も復帰は成立しているため recovered に含める（dry-run では復帰「予定」パス）。
  // failed は復帰していないため除く
  const _recovered = _results.filter(({ outcome }) => outcome !== 'failed').map(({ filePath }) => filePath);

  // 集計行は実際に復帰したときのみ出す。dry-run は 1 件も復帰していないため、
  // ここを通すと実行していない操作を実行したかのように報告することになる
  if (!_dryRun) { logger.info(`${LOGGER_TEXT.INDENT}復帰: ${_recovered.length} 件`); }

  return {
    recovered: _recovered,
    errors: _results.filter(({ outcome }) => outcome === 'error').map(({ filePath }) => filePath),
  };
};
