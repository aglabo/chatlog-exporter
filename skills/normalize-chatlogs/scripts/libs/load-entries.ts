// src: skills/normalize-chatlogs/scripts/libs/load-entries.ts
// @(#): normalize-chatlogs バッチエントリ読み込みユーティリティ
//       対象: loadEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';

// ─── Local
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { loadEntry } from './load-entry.ts';
// types
import type { LoadEntryFailure } from '../types/load-entry.types.ts';

/**
 * ファイルパス一覧から `ChatlogEntry` を並列読み込みし、成功分（`entries`）と
 * 失敗分（`errors`）に分離して返す。
 * - ファイルシステムエラーは `loadEntry` からそのままスローされる（このレベルでは捕捉しない）。
 * - フロントマター解析エラー等は `errors` に集約され、`entries` には含まれない。
 */
export const loadEntries = async (
  filePaths: string[],
  concurrency: number,
): Promise<{ entries: ChatlogEntry[]; errors: LoadEntryFailure[] }> => {
  const _results = await runConcurrent(
    filePaths,
    (filePath) => loadEntry(filePath),
    concurrency,
  );

  const entries = _results.filter((result): result is ChatlogEntry => result instanceof ChatlogEntry);
  const errors = _results.filter((result): result is LoadEntryFailure => !(result instanceof ChatlogEntry));

  return { entries, errors };
};
