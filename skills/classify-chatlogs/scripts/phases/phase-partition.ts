// src: scripts/phases/phase-partition.ts
// @(#): classify-chatlogs 分類候補エントリ分割モジュール
//       対象: partitionEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache, ClassifyPartition } from '../types/classify.types.ts';

/**
 * 読み込み済みエントリを、`cache` に判定結果（`project`）が既に設定されているかどうかのみで
 * `cached`（AI 分類が不要な確定済みエントリ）と `uncached`（AI 分類が必要な未確定エントリ）に分割する。
 *
 * `action`/`status` は判定に用いない。事前分類（`processClassifyNoAI`）の実行は呼び出し元の責務であり、
 * この関数は分割のみを行う。
 */
export const partitionEntries = (
  loaded: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
): ClassifyPartition => {
  const cached = loaded.filter((e) => !!cache.read(e.filePath!).project);
  const uncached = loaded.filter((e) => !cache.read(e.filePath!).project);
  return { cached, uncached };
};
