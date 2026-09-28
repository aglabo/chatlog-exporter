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
import { repairSegmentCoverage } from '../libs/line-utils.ts';
import { segmentChatlogs } from '../modules/segment-ai.ts';
// constants
import { NORMALIZE_CACHE_STATUSES } from '../types/cache.const.type.ts';
// libs
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';
import { getBasename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// types
import type { NormalizeCache } from '../types/cache.const.type.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

/** 修復した行番号を warn に列挙する上限。超過分は `...` に畳む（実測の最悪ケースは 25 行）。 */
const _WARN_LINE_SAMPLE_LIMIT = 5;

/**
 * `repairSegmentCoverage` が回収した非空行を報告する warn メッセージを組み立てる。
 *
 * 修復はセグメント件数を変えないため、未カバーだった行は新しいセグメントにはならず
 * **隣接セグメントへ吸収される**。つまりこの warn は「行が消えずに済んだ」だけでなく
 * 「本文がセグメント間を移動した」ことの唯一の signal なので、文言をその形にしてある。
 *
 * @param filePath              - 対象ファイルのパス（`getBasename` で短縮して埋め込む）
 * @param repairedNonBlankLines - 修復で回収した非空行の 1-based 行番号（昇順、1 件以上）
 * @returns `logger.warn` に渡す 1 行のメッセージ
 */
const _formatRepairWarning = (filePath: string, repairedNonBlankLines: number[]): string => {
  const _sample = repairedNonBlankLines.slice(0, _WARN_LINE_SAMPLE_LIMIT);
  const _lines = [..._sample, ...(repairedNonBlankLines.length > _sample.length ? ['...'] : [])].join(', ');
  return `phaseSegment: absorbed ${repairedNonBlankLines.length} uncovered non-blank line(s) `
    + `into adjacent segments — ${getBasename(filePath)} (lines ${_lines})`;
};

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
 * Before the `status: 'set'` write, the ranges go through {@link repairSegmentCoverage} so that
 * the cached boundaries cover the whole body — the AI regularly leaves head/tail/interior holes
 * and `extractLines` would drop those lines silently. Recovering non-blank lines emits one
 * `logger.warn` per file (see {@link _formatRepairWarning}); blank-only recoveries are silent.
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
      // The AI regularly leaves part of the body uncovered; `extractLines` would drop those lines
      // without an error. Repair the ranges here so the cache holds boundaries that cover the whole
      // body — `phase-write` re-slices from the cache and needs no change.
      const _repaired = repairSegmentCoverage(
        entry.content.split('\n'),
        segments.map((s) => ({
          title: s.title,
          summary: s.summary,
          startLine: s.startLine!,
          endLine: s.endLine!,
        })),
      );
      // Only non-blank recoveries are worth reporting: the trailing `''` from `split('\n')` is
      // uncovered on most files and warning about it would drown the real cases.
      if (_repaired.repairedNonBlankLines.length > 0) {
        logger.warn(_formatRepairWarning(filePath, _repaired.repairedNonBlankLines));
      }
      const _cacheEntry: Partial<NormalizeCache> = {
        status: NORMALIZE_CACHE_STATUSES.SET,
        segments: _repaired.segments,
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
 * - 累積文字数は reduce のアキュムレータで持ち回り、チャンク内で再集計しない
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
  entries.reduce<{ chunks: ChatlogEntry[][]; sum: number }>((acc, entry) => {
    const _last = acc.chunks.at(-1);
    const _fits = _last !== undefined
      && _last.length < batchSize
      && (maxBatchChars === 0 || acc.sum + entry.content.length <= maxBatchChars);
    return _fits
      ? { chunks: [...acc.chunks.slice(0, -1), [..._last, entry]], sum: acc.sum + entry.content.length }
      : { chunks: [...acc.chunks, [entry]], sum: entry.content.length };
  }, { chunks: [], sum: 0 }).chunks;

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
 * not the raw file. Newly-decided boundaries are repaired to cover the content contiguously
 * before they reach the cache — see {@link _processChunk}.
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
