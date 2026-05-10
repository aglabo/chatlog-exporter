// src: skills/_scripts/libs/file-ops/remove-utils.ts
// @(#): ファイル削除ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// shared modules
// ─────────────────────────────────────────────

// types
import type { RemoveProvider } from '../../types/providers.types.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** ファイル削除プロバイダのデフォルト実装 */
const _DEFAULT_REMOVE_PROVIDER: RemoveProvider = (path: string) => Deno.remove(path);

// ─────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────

/**
 * 指定パスのファイルを削除する。
 *
 * - 削除成功時は `true` を返す。
 * - ファイルが存在しない場合は `false` を返す（エラーにしない）。
 * - `Deno.errors.NotFound` 以外のエラーは再スローする。
 *
 * @param filePath - 削除するファイルの絶対パス
 * @param removeProvider - テスト用注入可能な remove 関数（デフォルト: `Deno.remove`）
 * @returns 削除成功時は `true`、ファイルが存在しない場合は `false`
 * @throws パーミッションエラーなど `NotFound` 以外のエラー
 */
export const removeFile = async (
  filePath: string,
  removeProvider: RemoveProvider = _DEFAULT_REMOVE_PROVIDER,
): Promise<boolean> => {
  try {
    await removeProvider(filePath);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) { return false; }
    throw e;
  }
};
