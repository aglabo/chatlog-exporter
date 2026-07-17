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
import { findBufferEntries } from './find-buffer-entries.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type {
  ClassifyBuffer,
  ClassifyPartition,
  ClassifyResult,
  ClassifyStats,
  FindBufferEntriesOptions,
} from '../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * ディレクトリを走査して分類対象ファイルを収集し、AI なし事前分類を適用したうえで
 * `resolved`（解決済み）・`cached`（キャッシュ済み REMAINING）・`uncached`（未キャッシュ REMAINING）に分割する。
 *
 * REMAINING エントリのうち `cache` に判定結果が既に存在するファイルは `cached` に、
 * キャッシュの `project` を用いて `action: MOVEBYAI` のエントリとして含める。
 * 未キャッシュの REMAINING エントリは `uncached` にそのまま含める。
 */
export const partitionClassifyEntries = async (
  searchDir: string,
  cache: ChatlogCache<ClassifyResult>,
  opts?: FindBufferEntriesOptions,
  stats?: ClassifyStats,
): Promise<ClassifyPartition> => {
  const buffer = await findBufferEntries(searchDir, opts, stats);
  const preClassified = processPreclassify(buffer);
  const resolved = preClassified.filter((e) => e.action !== CLASSIFY_ACTIONS.REMAINING);
  const remaining = preClassified.filter((e) => e.action === CLASSIFY_ACTIONS.REMAINING);

  const { cached, uncached } = remaining.reduce<
    { cached: ClassifyBuffer; uncached: ClassifyBuffer }
  >((acc, e) => {
    const _cachedProject = cache.read(e.file.filePath!).project;
    return _cachedProject != null
      ? { ...acc, cached: [...acc.cached, { ...e, project: _cachedProject, action: CLASSIFY_ACTIONS.MOVEBYAI }] }
      : { ...acc, uncached: [...acc.uncached, e] };
  }, { cached: [], uncached: [] });

  return { resolved, cached, uncached };
};
