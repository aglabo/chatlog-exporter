// src: scripts/libs/load-classify-entry.ts
// @(#): classify-chatlogs エントリ読み込みユーティリティ
//       対象: loadClassifyEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { loadChatlogEntry } from '../../../_scripts/libs/file-io/chatlog-entry-loader.ts';
import { isFileIoError } from '../../../_scripts/libs/file-io/read-utils.ts';

// ─── Local
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { LoadClassifyEntryFailure } from '../types/load-classify-entry.types.ts';

/**
 * ファイルパスから `ChatlogEntry` を読み込む。
 * - ファイルシステムエラー（`NotFound`, `PermissionDenied` 等）はそのままスロー（致命的エラー）。
 * - フロントマターの解析エラー（`InvalidFormat`, `InvalidYaml`）は `{ filePath, error }`
 *   （`LoadClassifyEntryFailure`）を返す。
 * - 正常時は読み込んだ `ChatlogEntry` をそのまま返す。
 */
export const loadClassifyEntry = async (
  filePath: string,
): Promise<ChatlogEntry | LoadClassifyEntryFailure> => {
  try {
    return await loadChatlogEntry(filePath);
  } catch (e) {
    if (isFileIoError(e) || (e instanceof ChatlogError && e.kind === 'FileDirNotFound')) {
      throw e;
    }
    const _error = e instanceof Error ? e : new Error(String(e));
    return { filePath, error: _error };
  }
};
