// src: skills/normalize-chatlogs/scripts/libs/cache-utils.ts
// @(#): normalize-chatlogs キャッシュ判定ユーティリティ
//       対象: toCacheKey, hasSegments
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// classes
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Local
import { extractSegmentBaseName } from '../modules/segment-io.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';

/** Derives a cache key from a source chatlog file path (same normalization as {@link extractSegmentBaseName}). */
export const toCacheKey = (filePath: string): string => extractSegmentBaseName(filePath);

/**
 * Whether the cache holds decided segment boundaries (`segments`) for `entry` —
 * i.e. AI planning succeeded (status `'set'` or `'done'` from this or a prior run).
 *
 * @param entry - Entry whose cache entry is checked
 * @param cache - Cache read for `segments`
 */
export const hasSegments = (entry: ChatlogEntry, cache: ChatlogCache<NormalizeCache>): boolean =>
  cache.read(toCacheKey(entry.filePath!)).segments !== undefined;
