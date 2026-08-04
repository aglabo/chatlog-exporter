// src: skills/_cle-libs/libs/file-ops/remove-utils.ts
// @(#): ファイル削除ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// shared modules
// ─────────────────────────────────────────────

// constants
import { LOGGER_TEXT } from '../../constants/logger.constants.ts';
// functions
import { isFileIoError } from '../file-io/read-utils.ts';
import { logger } from '../io/logger.ts';
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
 * - ファイル I/O 起因のエラー（`NotFound` 含む）は `throwFileIoError` の値に従う（デフォルト: `true`）。
 *   - `true`（デフォルト）の場合はそのまま再スローする。
 *   - `false` の場合は `logger.warn` でログ出力した上で `false` を返す。
 * - ファイル I/O 起因ではないエラーは `throwFileIoError` の値に関わらず常に再スローする。
 *
 * @param filePath - 削除するファイルの絶対パス
 * @param options - テスト用注入可能な remove 関数、およびエラー throw 挙動の指定
 * @param options.removeProvider - テスト用注入可能な remove 関数（デフォルト: `Deno.remove`）
 * @param options.throwFileIoError - ファイル I/O 起因のエラーを throw するか（デフォルト: `true`）
 */
export function removeFile(
  filePath: string,
  options?: { removeProvider?: RemoveProvider; throwFileIoError?: true },
): Promise<boolean>;
export function removeFile(
  filePath: string,
  options: { removeProvider?: RemoveProvider; throwFileIoError: false },
): Promise<boolean>;
export async function removeFile(
  filePath: string,
  options?: { removeProvider?: RemoveProvider; throwFileIoError?: boolean },
): Promise<boolean> {
  const { removeProvider = _DEFAULT_REMOVE_PROVIDER, throwFileIoError = true } = options ?? {};
  try {
    await removeProvider(filePath);
    return true;
  } catch (e) {
    if (!isFileIoError(e)) {
      throw e;
    }
    if (throwFileIoError) {
      throw e;
    }
    logger.warn(`${LOGGER_TEXT.INDENT}削除失敗 (${(e as Error).message}): ${filePath}`);
    return false;
  }
}
