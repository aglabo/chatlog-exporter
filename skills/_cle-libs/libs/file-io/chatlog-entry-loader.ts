// src: skills/_cle-libs/libs/file-io/chatlog-entry-loader.ts
// @(#): ChatlogEntry 読み込みユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared modules ---
import { readTextFile } from './read-utils.ts';
// classes
import { ChatlogEntry } from '../../classes/ChatlogEntry.class.ts';

// --- functions ---
/**
 * ファイルパスからテキストを読み込み、`ChatlogEntry` インスタンスを生成する。
 * - ファイル I/O 起因のエラー（`ChatlogError('FileDirNotFound')` 等）は、通常は呼び出し元に throw する
 *   （`throwFileIoError: false` を除く）。
 * - `throwFileIoError: false` を指定すると、ファイル I/O 起因のエラーは throw せず `null` を返す。
 * - frontmatter 解析エラー（`ChatlogError('InvalidFormat')` / `ChatlogError('InvalidYaml')` 等）は
 *   ファイル I/O 起因ではないため、`throwFileIoError` の値に関わらず常に呼び出し元に throw する。
 *
 * @param filePath - 読み込む Chatlog エントリファイルの絶対パス
 * @param throwFileIoError - ファイル I/O 起因のエラーを throw するか（デフォルト: `true`）
 * @returns 読み込んだ内容から生成した `ChatlogEntry` インスタンス（`throwFileIoError: false` でファイル I/O エラー時は `null`）
 */
export function loadChatlogEntry(filePath: string, throwFileIoError?: true): Promise<ChatlogEntry>;
export function loadChatlogEntry(filePath: string, throwFileIoError: false): Promise<ChatlogEntry | null>;
export async function loadChatlogEntry(
  filePath: string,
  throwFileIoError = true,
): Promise<ChatlogEntry | null> {
  const textOrError = await readTextFile(filePath, { throwFileIoError: false });
  if (textOrError instanceof Error) {
    if (throwFileIoError) {
      throw textOrError;
    }
    return null;
  }
  return new ChatlogEntry(textOrError, { filePath });
}
