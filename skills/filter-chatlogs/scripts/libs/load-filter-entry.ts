// src: scripts/libs/load-filter-entry.ts
// @(#): filter-chatlogs 共通エントリローダー
//       対象: loadFilterEntry / loadFilterEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { loadChatlogEntry } from '../../../_cle-libs/libs/file-io/chatlog-entry-loader.ts';
import { isFileIoError } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';

// ─── Local
import { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import type { CLEResult } from '../types/cache.types.ts';
import type { LoadFilterEntryFailure } from '../types/load-filter-entry.types.ts';
// constants
import { FILTER_DECISIONS } from '../types/filter-decision.const.types.ts';

/**
 * ファイルパスから `ChatlogEntry` を読み込む。
 * - ファイルシステムエラー（`NotFound`, `PermissionDenied` 等）はそのままスロー（致命的エラー）。
 * - フロントマターの解析エラー（`InvalidFormat`, `InvalidYaml`）は `{ filePath, error }` を返す
 *   （`cache` への書き込みは呼び出し元の `loadFilterEntries` が担う）。
 * - 正常時は読み込んだ `ChatlogEntry` をそのまま返す。
 */
export const loadFilterEntry = async (
  filePath: string,
): Promise<ChatlogEntry | LoadFilterEntryFailure> => {
  try {
    return await loadChatlogEntry(filePath);
  } catch (e) {
    if (isFileIoError(e) || (e instanceof ChatlogError && e.kind === 'FileDirNotFound')) {
      throw e;
    }
    return { filePath, error: e instanceof Error ? e : new Error(String(e)) };
  }
};

/**
 * ファイルパス一覧から `ChatlogEntry` を並列読み込みし、成功分と失敗分に振り分ける。
 * 失敗分（frontmatter 解析エラー等）はまとめて `cache` に `decision: ERROR` と `reason` を書き込む。
 * `cache` を省略した場合は ERROR 書き込みを行わない。
 * `concurrency` で読み込み・cache 書き込みの並列度を制限する。
 */
export const loadFilterEntries = async (
  filePaths: string[],
  cache: ChatlogCache<CLEResult> | undefined,
  concurrency: number,
): Promise<{ entries: ChatlogEntry[]; errors: { filePath: string; error: Error }[] }> => {
  const results = await runConcurrent(
    filePaths,
    (filePath) => loadFilterEntry(filePath),
    concurrency,
  );

  const entries = results.filter((result): result is ChatlogEntry => result instanceof ChatlogEntry);
  const errors = results.filter((result): result is LoadFilterEntryFailure => !(result instanceof ChatlogEntry));

  if (cache) {
    await runConcurrent(
      errors,
      ({ filePath, error }) =>
        cache.write(filePath, { decision: FILTER_DECISIONS.ERROR, confidence: 0, reason: error.message }),
      concurrency,
    );
  }

  return { entries, errors };
};
