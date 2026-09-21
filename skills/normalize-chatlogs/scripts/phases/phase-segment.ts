// src: skills/normalize-chatlogs/scripts/phases/phase-segment.ts
// @(#): AI セグメント分割計画フェーズ
//       対象: phaseSegment
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// classes
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
// types
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Local
import { hasSegments, toCacheKey } from '../libs/cache-utils.ts';
import { segmentChatlogs } from '../modules/segment-ai.ts';
// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';
// libs
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

/**
 * Runs `segmentChatlogs` for a single `chunk` and persists newly-decided segment
 * boundaries to the cache.
 *
 * On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written to the cache
 * with `status: 'set'`, so a subsequent run does not re-invoke the AI. When the AI returned
 * no entry for a file, returned an empty segment array, or returned a segment missing
 * `startLine`/`endLine`, `status: 'retry'` is written instead (no `segments`) so the file is
 * re-decided on the next run, and the entry is excluded from the result. The failure cause is
 * not distinguished. Only called for non-`dryRun` runs — see `phaseSegment`.
 *
 * @param chunk  - Entries to segment together in a single AI call
 * @param config - Model/timeout options forwarded to `segmentChatlogs`
 * @param cache  - Cache written with decided segment boundaries
 * @param signal - Abort signal forwarded to `segmentChatlogs`, aborted when a sibling chunk fails
 * @returns Entries from `chunk` whose segment boundaries were successfully written to the cache
 */
const _processChunk = async (
  chunk: ChatlogEntry[],
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs'>,
  cache: ChatlogCache<NormalizeCache>,
  signal: AbortSignal,
): Promise<ChatlogEntry[]> => {
  const _aiResultMap = await segmentChatlogs(chunk, {
    model: config.model,
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    signal,
  });

  const _results = await Promise.all(
    chunk.map(async (entry) => {
      const filePath = entry.filePath!;
      const segments = _aiResultMap.get(filePath);
      if (
        !segments || segments.length === 0
        || segments.some((s) => s.startLine === undefined || s.endLine === undefined)
      ) {
        // Record the file as pending re-decision instead of leaving it silently unaccounted for.
        // An empty `segments` array must NOT be written as `status: 'set'` — that would make
        // `hasSegments` true forever and the file would never be segmented again.
        await cache.write(toCacheKey(filePath), { status: NORMALIZE_CACHE_STATUSES.RETRY });
        return null;
      }
      const _cacheEntry: Partial<NormalizeCache> = {
        status: NORMALIZE_CACHE_STATUSES.SET,
        segments: segments.map((s) => ({
          title: s.title,
          summary: s.summary,
          startLine: s.startLine!,
          endLine: s.endLine!,
        })),
      };
      // write() (overwrite, not merge) is safe here: files reaching phaseSegment have
      // status === undefined or 'retry' (done/set entries are filtered out by _classifyEntries in
      // process-files.ts), and neither carries `segments` worth preserving.
      await cache.write(toCacheKey(filePath), _cacheEntry);
      return entry;
    }),
  );

  return _results.filter((entry): entry is ChatlogEntry => entry !== null);
};

/**
 * 件数上限 `batchSize` と累積文字数上限 `maxBatchChars` の **早い方** でチャンクを閉じる。
 *
 * - `maxBatchChars === 0` は無制限（`maxContentLength: 0` と同じ規約）
 * - 単一ファイルが `maxBatchChars` を超える場合、そのファイル単独で 1 チャンクとする
 *   （空チャンクを作らない）
 * - 入力順を保存し、全エントリがちょうど 1 チャンクに 1 回だけ現れる
 *
 * @param entries       - チャンク分割対象のエントリ（入力順）
 * @param batchSize     - 1 チャンクあたりの最大ファイル数
 * @param maxBatchChars - 1 チャンクあたりの累積 `content.length` 上限（0 = 無制限）
 * @returns 入力順を保った ChatlogEntry の配列の配列
 */
const _chunkEntries = (
  entries: ChatlogEntry[],
  batchSize: number,
  maxBatchChars: number,
): ChatlogEntry[][] =>
  entries.reduce<ChatlogEntry[][]>((chunks, entry) => {
    const _last = chunks.at(-1);
    const _fits = _last !== undefined
      && _last.length < batchSize
      && (maxBatchChars === 0
        || _last.reduce((sum, e) => sum + e.content.length, 0) + entry.content.length <= maxBatchChars);
    return _fits ? [...chunks.slice(0, -1), [..._last, entry]] : [...chunks, [entry]];
  }, []);

/**
 * Determines segment split plans for `entries`, preferring cached `segments`
 * (resume support) over a fresh AI call, and persists newly-decided segments to the cache.
 *
 * When `config.dryRun` is true, no AI call is made and no cache write happens: only
 * already-cached entries are returned, uncached entries are left unplanned (the caller
 * accounts for them as skipped — see `_accountSegmentFailures` in `process-files.ts`).
 *
 * Entries with cached `segments` are returned as-is (no AI call). The remainder is chunked by
 * {@link _chunkEntries} under two limits, whichever is reached first: at most `config.batchSize`
 * files per chunk (default `DEFAULT_BATCH_SIZE`, forced to 1 when `config.singleFile` is
 * true) and at most `config.maxBatchChars` cumulative `content` characters per chunk
 * (default `DEFAULT_MAX_BATCH_CHARS`, `0` meaning unlimited). A single file exceeding
 * `maxBatchChars` becomes a chunk of its own rather than producing an empty chunk. Each chunk
 * is processed via {@link _processChunk} with parallelism `concurrency` to bound prompt size
 * and timeout risk. On success, segment data (`title`/`summary`/`startLine`/`endLine`) are written
 * to the cache. Entries whose AI call failed, whose segments came back empty, or whose segments
 * are missing `startLine`/`endLine`, are excluded from the result and written with
 * `status: 'retry'` so the next run re-decides them.
 *
 * Segment boundaries are line numbers within `ChatlogEntry.content` (frontmatter excluded),
 * not the raw file.
 *
 * @param entries     - Files loaded as `ChatlogEntry`
 * @param cache       - Cache read for resume, written with decided segment boundaries
 * @param config      - Model/timeout/singleFile/dryRun options forwarded to `segmentChatlogs`, plus
 *                      the `batchSize`/`maxBatchChars` chunk limits (both required; resolved by `buildConfig`)
 * @param concurrency - Parallelism for processing chunks
 * @returns Entries whose segment boundaries are present in the cache after this call
 */
export const phaseSegment = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<NormalizeCache>,
  config: Pick<NormalizeConfig, 'model' | 'timeoutMs' | 'dryRun' | 'singleFile' | 'batchSize' | 'maxBatchChars'>,
  concurrency: number,
): Promise<ChatlogEntry[]> => {
  const _cachedEntries = entries.filter((entry) => hasSegments(entry, cache));
  if (config.dryRun) {
    return _cachedEntries;
  }
  const _uncachedEntries = entries.filter((entry) => !hasSegments(entry, cache));

  const _chunks = _chunkEntries(
    _uncachedEntries,
    config.singleFile ? 1 : config.batchSize,
    config.maxBatchChars,
  );

  const _processedChunks = await runConcurrent(
    _chunks,
    (chunk, ctl) => _processChunk(chunk, config, cache, ctl.signal),
    concurrency,
  );

  return [..._cachedEntries, ..._processedChunks.flat()];
};
