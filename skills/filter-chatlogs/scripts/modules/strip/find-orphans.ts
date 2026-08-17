// src: scripts/modules/strip/find-orphans.ts
// @(#): strip 孤立退避の検出（R-014 / DR-23 / DR-26）
//       対象: findOrphans
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words baks

// ─── shared ───
// functions
import { findFilesFlat } from '../../../../_cle-libs/libs/file-ops/find-files.ts';
// types
import type { GlobProvider } from '../../../../_cle-libs/types/providers.types.ts';

// ─── internal ───
// constants
import { BAK_SUFFIX } from '../../constants/common.constants.ts';

// ─── constants ───

/**
 * 退避の列挙に使う glob 拡張子。`.md` 由来の退避のみを対象とする（DR-23 決定 1）。
 *
 * `BAK_SUFFIX` を glob に渡すとエディタ等が作った `notes.bak` まで拾ってしまうため、
 * 本体の拡張子まで含めた形で絞り込む。**本体パスの復元には使わないこと**
 * （`BAK_SUFFIX` の長さで切り詰めないと `<name>.md` にならない）。
 */
const _BAK_GLOB_EXT = '.md.bak';

// ─── functions ───

/**
 * 対象ディレクトリ直下を走査し、本体を伴わない退避（孤立退避）を検出する（R-014 / DR-23 / DR-26）。
 *
 * 孤立退避とは `<name>.md` が存在せず `<name>.md.bak` が存在する状態であり、
 * REQ-NF-005 の手順 2（退避）と手順 3（スワップ）の間で中断すると生じる。
 *
 * `<name>.md.tmp` は検出対象に含めない（DR-26）。REQ-NF-005 の手順 1 の時点では
 * `<name>.md` が無傷で存在するため、`.tmp` 単独で本体を伴わない状態は正常な処理順序では
 * 生じない。また `.tmp` は書き込み途中の産物であり復帰元にもできない。
 *
 * `*.md` は `<name>.md.bak` に一致しないため、本体一覧と退避一覧は互いに素になる。
 * 照合は大小文字を変換せず完全一致で行う（DR-25。`findFilesFlat` の正規化基準と揃える）。
 * 探索は `sweepBackups` と同じく 1 段のみで、サブディレクトリは対象外とする。
 *
 * 復帰元の退避パスは `` `${filePath}${BAK_SUFFIX}` `` で構成できるため戻り値に含めない
 * （`sweepBackups` が期待退避パスを構成するのと同じ方法）。
 *
 * 検出した件数を error として計上するか否かは実行モードにより異なるため、この関数は
 * `stats` を受け取らず判定結果のみを返す（計上は呼び出し側の責務）。
 *
 * @param targetDir - 走査対象ディレクトリ
 * @param options - `glob`（ファイル一覧取得）のテスト用注入
 * @returns 復帰先となる本体パス（`<name>.md`）の辞書順一覧。いずれも実在しない。
 */
export const findOrphans = async (
  targetDir: string,
  options?: { glob?: GlobProvider },
): Promise<string[]> => {
  const _glob = options?.glob;
  const [_bodies, _baks] = await Promise.all([
    findFilesFlat(targetDir, { glob: _glob }),
    findFilesFlat(targetDir, { ext: _BAK_GLOB_EXT, glob: _glob }),
  ]);

  const _bodySet = new Set(_bodies);
  return _baks
    .map((bakPath) => bakPath.slice(0, -BAK_SUFFIX.length))
    .filter((filePath) => !_bodySet.has(filePath))
    .toSorted();
};
