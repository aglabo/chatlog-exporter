// src: scripts/modules/partition-classify-entries.ts
// @(#): classify-chatlogs 分類候補エントリ分割モジュール
//       対象: partitionClassifyEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local
import { processPreclassify } from './classify-noai.ts';
import { findChatlogFilePaths, loadClassifyEntries } from './find-buffer-entries.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache, ClassifyPartition, FindBufferEntriesOptions } from '../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * ディレクトリを走査して分類対象ファイルを収集し、AI なし事前分類を適用したうえで
 * 今回発見した全ファイルパス（`filePaths`）・読み込み成功エントリの Map（`entries`）・
 * AI 分類が必要な未キャッシュエントリ（`uncached`）に分割する。
 *
 * REMAINING エントリのうち `cache` に判定結果（`project`）が既に存在するファイルは、
 * `cache` に `action: MOVEBYAI` を書き込むのみで `uncached` には含めない。
 * 未キャッシュの REMAINING エントリは `uncached` にそのまま含める。
 */
export const partitionClassifyEntries = async (
  searchDir: string,
  cache: ChatlogCache<ClassifyCache>,
  opts?: FindBufferEntriesOptions,
): Promise<ClassifyPartition> => {
  const filePaths = await findChatlogFilePaths(searchDir, opts);
  const loaded = await loadClassifyEntries(filePaths, cache, opts);
  const entries = new Map<string, ChatlogEntry>(loaded.map((e) => [e.entry.filePath!, e.entry]));
  // processPreclassify の REMAINING 判定は cache.write（上書き）で project を消してしまうため、
  // 前回 AI が確定済みの project は preclassify 実行前にスナップショットしておく。
  const _cachedProjects = new Map(loaded.map((e) => [e.entry.filePath!, cache.read(e.entry.filePath!).project]));

  await processPreclassify(loaded, cache);

  const remaining = loaded.filter((e) => cache.read(e.entry.filePath!).action === CLASSIFY_ACTIONS.REMAINING);
  const uncached = (await Promise.all(
    remaining.map(async (e) => {
      const _cachedProject = _cachedProjects.get(e.entry.filePath!);
      if (_cachedProject != null) {
        await cache.write(e.entry.filePath!, { project: _cachedProject, action: CLASSIFY_ACTIONS.MOVEBYAI });
        return undefined;
      }
      return e.entry;
    }),
  )).filter((file): file is ChatlogEntry => file !== undefined);

  return { filePaths, entries, uncached };
};
