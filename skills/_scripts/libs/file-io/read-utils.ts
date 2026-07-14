// src: skills/_scripts/libs/file-io/read-utils.ts
// @(#): ファイル読み込みユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared modules ---
import { normalizeLine } from '../text/line-utils.ts';
// classes
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
// providers
import type { ReadTextFileProvider } from '../../types/providers.types.ts';

// --- consstants ---
/** `Deno.readTextFile` をデフォルト実装として使う読み込みプロバイダ。 */
const _DEFAULT_READ_PROVIDER: ReadTextFileProvider = (path: string) => Deno.readTextFile(path);

/** ファイル I/O 操作で発生しうる `Deno.errors.*` エラークラスの一覧。 */
const _FILE_IO_ERROR_CLASSES = [
  Deno.errors.NotFound,
  Deno.errors.PermissionDenied,
  Deno.errors.IsADirectory,
  Deno.errors.NotADirectory,
  Deno.errors.FilesystemLoop,
  Deno.errors.NotCapable,
  Deno.errors.Busy,
  Deno.errors.Interrupted,
  Deno.errors.InvalidData,
];

// --- functions ---
/**
 * ファイル I/O 起因の Deno エラーかどうかを判定する。
 *
 * @param error - 判定対象の値
 * @returns ファイル I/O 起因のエラーなら `true`
 */
export const isFileIoError = (error: unknown): boolean =>
  _FILE_IO_ERROR_CLASSES.some((ErrorClass) => error instanceof ErrorClass);

/**
 * ファイルを読み込み、行末文字を LF に正規化して返す。
 * - ファイルが存在しない場合は `ChatlogError('FileDirNotFound')` を throw する（`throwFileIoError: false` を除く）。
 * - その他のファイル I/O 起因のエラー（PermissionDenied 等）はそのまま再 throw する（`throwFileIoError: false` を除く）。
 * - `throwFileIoError: false` を指定すると、ファイル I/O 起因のエラーは throw せず、その内容を保持した
 *   `Error` インスタンスを返す（`NotFound` の場合は `ChatlogError('FileDirNotFound')`）。
 *   ファイル I/O 起因ではないエラーは `throwFileIoError` の値に関わらず常に再 throw する。
 *
 * @param path - 読み込むファイルの絶対パス
 * @param options - テスト用注入可能な読み込み関数、およびエラー throw 挙動の指定
 * @param options.readProvider - テスト用注入可能な読み込み関数（デフォルト: `Deno.readTextFile`）
 * @param options.throwFileIoError - ファイル I/O 起因のエラーを throw するか（デフォルト: `true`）
 */
export function readTextFile(
  path: string,
  options?: { readProvider?: ReadTextFileProvider; throwFileIoError?: true },
): Promise<string>;
export function readTextFile(
  path: string,
  options: { readProvider?: ReadTextFileProvider; throwFileIoError: false },
): Promise<string | Error>;
export async function readTextFile(
  path: string,
  options?: { readProvider?: ReadTextFileProvider; throwFileIoError?: boolean },
): Promise<string | Error> {
  const { readProvider = _DEFAULT_READ_PROVIDER, throwFileIoError = true } = options ?? {};
  try {
    return normalizeLine(await readProvider(path));
  } catch (e) {
    if (!isFileIoError(e)) {
      throw e;
    }
    const ioError = e instanceof Deno.errors.NotFound
      ? new ChatlogError('FileDirNotFound', 'NotFound', path)
      : (e as Error);
    if (throwFileIoError) {
      throw ioError;
    }
    return ioError;
  }
}
