// src: scripts/modules/strip/sweep-backups.ts
// @(#): strip 退避の一括削除（R-010〜R-013: 保持ゲート → 包含検査 → 一括削除）
//       対象: sweepBackups
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { findFilesFlat } from '../../../../_cle-libs/libs/file-ops/find-files.ts';
import { removeFile } from '../../../../_cle-libs/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_cle-libs/libs/io/logger.ts';
import { runConcurrent } from '../../../../_cle-libs/libs/parallel/concurrency.ts';
// classes
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
// constants
import { LOGGER_TEXT } from '../../../../_cle-libs/constants/logger.constants.ts';
// types
import type { GlobProvider, RemoveProvider } from '../../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// constants
import { BAK_SUFFIX } from '../../constants/common.constants.ts';

// ─── constants ───

/**
 * 退避の列挙に使う glob 拡張子。`.md` 由来の退避のみを対象とする（DR-23 決定 1）。
 *
 * `BAK_SUFFIX` を glob に渡すとエディタ等が作った `notes.bak` まで列挙され、
 * R-010 の一括削除が strip と無関係なファイルを破壊する。
 * **期待退避パスの構成には使わないこと**（構成は `` `${path}${BAK_SUFFIX}` `` で行う）。
 */
const _BAK_GLOB_EXT = '.md.bak';

// ─── functions ───

/**
 * 全ファイルの評価を終えた後、対象ディレクトリ配下の退避（`.bak`）を一括削除する（Phase 6）。
 *
 * この機能の安全性は退避に依存するため、削除の前に 2 つのゲートを通す。
 *
 * - R-011: `errorCount` が 1 件以上なら削除を行わず退避を全保持する（正常終了）。
 * - R-013: `{ stripped と判定したパス } ⊆ { 存在する退避のパス }` を検査する。
 *   破れている場合は「stripped と計上したのに退避を持たないファイルが存在する」ことを意味し、
 *   本体が書き換わった上で復旧手段が無い状態のため、削除を一切行わず不足パスを報告する。
 * - R-010: 上記を通過したとき、退避一覧の全件を削除する。
 * - R-012: 削除に失敗した退避が 1 件以上あれば、中断せず全件試行した上で件数とパスを報告する。
 *
 * 包含検査は大小文字を変換せず完全一致で照合する（DR-25）。件数比較では代替しない
 * （当該実行が作らなかった残骸の退避が含まれうるため、退避一覧が stripped より多いのは正常）。
 * こうした当該実行に由来しない退避も削除対象に含む（DR-08 決定 2）。削除の前に件数とパスを
 * 警告として報告する（DR-34）。報告は削除範囲・戻り値・終了コードのいずれも変えない。
 *
 * DD-03 に従い throw せず `ChatlogError` を返す。削除の例外捕捉は 1 件ごとに閉じる必要がある。
 * 削除全体を一括で捕捉すると、DD-03 の no-throw は満たしても残りの退避が中断され R-012 が破れる。
 * 終了コードは呼び出し側（main）の責務であり、
 * R-012 と R-013 の区別は `subindex` が担う。削除失敗は分類（stripped/done/passthrough/error）に
 * 加えないため `stats` を受け取らない。dry-run 時は呼び出し側がこの関数を呼ばない設計のため
 * `dryRun` 引数を持たない。
 *
 * @param targetDir - 退避を探索する対象ディレクトリ
 * @param strippedPaths - `stripped` と判定されたファイルのパス一覧。
 *   **`normalizePath` 適用済みであることを前提とする**（正規化は呼び出し側の責務）。
 *   期待退避パスの構成は `` `${path}${BAK_SUFFIX}` `` で行うため、
 *   `findFilesFlat` が返す正規化済みパスと基準がずれると包含検査全体が成立しない。
 * @param errorCount - 当該実行で error として計上された件数
 * @param concurrency - 同時実行する退避削除処理の最大並列数。
 * @param options - `glob`（退避一覧の取得）、`removeProvider`（削除）のテスト用注入
 * @returns 不足退避または削除失敗があれば `ChatlogError`、それ以外は `undefined`
 */
export const sweepBackups = async (
  targetDir: string,
  strippedPaths: string[],
  errorCount: number,
  concurrency: number,
  options?: { glob?: GlobProvider; removeProvider?: RemoveProvider },
): Promise<ChatlogError | undefined> => {
  // R-011: error があれば復旧手段を残すため退避を全保持する
  if (errorCount > 0) {
    logger.info(`${LOGGER_TEXT.INDENT}error ${errorCount} 件のため退避を保持します`);
    return undefined;
  }

  const _backups = await findFilesFlat(targetDir, { ext: _BAK_GLOB_EXT, glob: options?.glob });

  // R-013: 期待退避パスを原形のまま構成し、退避一覧との完全一致で包含を検査する
  const _backupSet = new Set(_backups);
  const _missing = strippedPaths
    .map((path) => `${path}${BAK_SUFFIX}`)
    .filter((bakPath) => !_backupSet.has(bakPath));

  if (_missing.length > 0) {
    logger.error(`退避が見つかりません（${_missing.length} 件）。退避を保持し削除を中止します`);
    _missing.forEach((bakPath) => logger.error(`${LOGGER_TEXT.INDENT}missing: ${bakPath}`));
    return new ChatlogError(
      'FailFast',
      'BackupMissing',
      `backup missing (${_missing.length}): ${_missing.join(', ')}`,
    );
  }

  // R-010: 当該実行の stripped に由来しない退避も削除するため、削除の前に件数とパスを報告する（DR-34）
  const _expected = new Set(strippedPaths.map((path) => `${path}${BAK_SUFFIX}`));
  const _foreign = _backups.filter((bakPath) => !_expected.has(bakPath));

  if (_foreign.length > 0) {
    logger.warn(`当該実行の stripped に由来しない退避を削除します（${_foreign.length} 件）`);
    _foreign.forEach((bakPath) => logger.warn(`${LOGGER_TEXT.INDENT}foreign: ${bakPath}`));
  }

  // R-010: 1 件の失敗で中断せず全件の削除を試行する
  const _results = await runConcurrent(_backups, async (bakPath) => {
    // DD-03: `removeFile` は file-I/O でないエラーを `throwFileIoError: false` でも再 throw する
    // （remove-utils.ts:63-64）。ここで捕捉しないと例外が関数外へ漏れ、no-throw 契約が破れる。
    // 捕捉は 1 件ごとに閉じる。`runConcurrent` 全体を包むと reject が `AbortController` で
    // 残タスクを止めてしまい、全件試行を求める R-012 が破れる
    try {
      return {
        bakPath,
        removed: await removeFile(bakPath, { removeProvider: options?.removeProvider, throwFileIoError: false }),
      };
    } catch (e) {
      logger.error(`${LOGGER_TEXT.INDENT}削除失敗 (${(e as Error).message}): ${bakPath}`);
      return { bakPath, removed: false };
    }
  }, concurrency);
  const _failed = _results.filter(({ removed }) => !removed).map(({ bakPath }) => bakPath);

  // R-012: 削除に失敗した退避があれば件数とパスを報告する
  if (_failed.length > 0) {
    logger.error(`退避の削除に失敗しました（${_failed.length} 件）`);
    _failed.forEach((bakPath) => logger.error(`${LOGGER_TEXT.INDENT}failed: ${bakPath}`));
    return new ChatlogError(
      'FailFast',
      'BackupSweepFailed',
      `backup sweep failed (${_failed.length}): ${_failed.join(', ')}`,
    );
  }

  logger.info(`${LOGGER_TEXT.INDENT}退避を削除しました: ${_backups.length} 件`);
  return undefined;
};
