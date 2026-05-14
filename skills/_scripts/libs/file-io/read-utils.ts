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

// --- functions ---
/**
 * ファイルを読み込み、行末文字を LF に正規化して返す。
 * - ファイルが存在しない場合は `ChatlogError('FileDirNotFound')` を throw する。
 * - その他のエラー（PermissionDenied 等）はそのまま再 throw する。
 *
 * @param path - 読み込むファイルの絶対パス
 * @param readProvider - テスト用注入可能な読み込み関数（デフォルト: `Deno.readTextFile`）
 */
export const readTextFile = async (
  path: string,
  readProvider: ReadTextFileProvider = _DEFAULT_READ_PROVIDER,
): Promise<string> => {
  try {
    return normalizeLine(await readProvider(path));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new ChatlogError('FileDirNotFound', 'Path', path);
    }
    throw e;
  }
};
