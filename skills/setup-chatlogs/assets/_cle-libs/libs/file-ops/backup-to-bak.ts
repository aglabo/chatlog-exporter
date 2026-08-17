// src: skills/_cle-libs/libs/file-ops/backup-to-bak.ts
// @(#): 既存ファイルを .bak 拡張子付加でバックアップするユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// shared modules
// ─────────────────────────────────────────────

// functions
import { fileExists } from './exists-utils.ts';
// types
import type { RenameProvider, StatProvider } from '../../types/providers.types.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** バックアップ先に付加する拡張子 */
const _BAK_SUFFIX = '.bak';

/** ファイルリネームプロバイダのデフォルト実装 */
const _defaultRename: RenameProvider = (oldPath: string, newPath: string) => Deno.rename(oldPath, newPath);

/** ファイル情報取得プロバイダのデフォルト実装 */
const _defaultStat: StatProvider = (path: string) => Deno.stat(path);

// ─────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────

/**
 * 既存ファイルを `<path>.bak` にリネームしてバックアップする。
 *
 * 拡張子は「付加」であり「置換」ではない（`entry.md` → `entry.md.bak`）。
 * 連番・世代管理は持たず、退避先が既に存在する場合は何もしない。
 *
 * - 退避先 `<path>.bak` が存在する → リネームせず `null` を返す（例外は投げない）
 * - 退避先が存在しない → `<path>` を `<path>.bak` にリネームし、そのパスを返す
 *
 * 元ファイルが存在しない場合は `rename` が `Deno.errors.NotFound` を投げ、
 * そのまま呼び出し元へ伝播する（fail-first）。
 *
 * @param path         - バックアップ対象のファイルパス
 * @param rename       - ファイルをリネームする関数（テスト用インジェクション可能、デフォルト: `Deno.rename`）
 * @param statProvider - ファイル情報を取得する関数（テスト用インジェクション可能、デフォルト: `Deno.stat`）
 * @returns 作成した退避先パス、または退避先が既存でバックアップしなかった場合は `null`
 * @throws 元ファイル不在（`Deno.errors.NotFound`）などリネーム失敗時のエラー
 */
export const backupToBak = async (
  path: string,
  rename: RenameProvider = _defaultRename,
  statProvider: StatProvider = _defaultStat,
): Promise<string | null> => {
  const _bakPath = `${path}${_BAK_SUFFIX}`;
  if (await fileExists(_bakPath, statProvider)) { return null; }

  await rename(path, _bakPath);
  return _bakPath;
};
