// src: scripts/modules/partition-classify-entries.ts
// @(#): classify-chatlogs 分類候補エントリ分割モジュール
//       対象: partitionByPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local
import { processPreclassify } from './classify-noai.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache, ClassifyPartition } from '../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * 読み込み済みエントリに AI なし事前分類を適用したうえで、読み込み済みエントリ全件
 * （`entries`、読み込み失敗分も含む）と AI 分類が必要な未キャッシュエントリ（`uncached`）に分割する。
 *
 * REMAINING エントリのうち `cache` に判定結果（`project`）が既に存在するファイルは、
 * `cache` に `action: MOVEBYAI` を書き込むのみで `uncached` には含めない。
 * 未キャッシュの REMAINING エントリは `uncached` にそのまま含める。
 *
 * 読み込み失敗（`cache` の `action` が既に `ERROR`）のエントリは、`processPreclassify` に渡すと
 * 空内容ゆえに `too-short fallback` 等で `ERROR` が上書きされてしまうため、事前分類の対象から除外する。
 */
export const partitionByPreclassify = async (
  loaded: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
): Promise<ClassifyPartition> => {
  const entries = loaded;
  // processPreclassify の REMAINING 判定は cache.write（上書き）で project を消してしまうため、
  // 前回 AI が確定済みの project は preclassify 実行前にスナップショットしておく。
  const _cachedProjects = new Map(loaded.map((e) => [e.filePath!, cache.read(e.filePath!).project]));

  await processPreclassify(
    loaded.filter((e) => cache.read(e.filePath!).action !== CLASSIFY_ACTIONS.ERROR),
    cache,
  );

  const remaining = loaded.filter((e) => cache.read(e.filePath!).action === CLASSIFY_ACTIONS.REMAINING);
  const uncached = (await Promise.all(
    remaining.map(async (e) => {
      const _cachedProject = _cachedProjects.get(e.filePath!);
      if (_cachedProject != null) {
        await cache.write(e.filePath!, { project: _cachedProject, action: CLASSIFY_ACTIONS.MOVEBYAI });
        return undefined;
      }
      return e;
    }),
  )).filter((file): file is ChatlogEntry => file !== undefined);

  return { entries, uncached };
};
