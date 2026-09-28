// src: skills/normalize-chatlogs/scripts/libs/line-utils.ts
// @(#): normalize-chatlogs 行範囲抽出ユーティリティ
//       対象: extractLines, repairSegmentCoverage
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Local
// types
import type { CachedSegment } from '../types/cache.const.type.ts';

/**
 * Extracts the inclusive line range `[startLine, endLine]` (1-based) from `lines`, clamped to bounds.
 *
 * Used both for the initial AI response (segmentChatlogs) and for re-slicing content from
 * cached `{startLine, endLine}` ranges on resume (process-files phase 4).
 */
export const extractLines = (lines: string[], startLine: number, endLine: number): string => {
  const total = lines.length;
  if (total === 0) { return ''; }
  if (startLine > endLine) { return ''; }
  const start = Math.max(1, Math.min(startLine, total));
  const end = Math.max(start, Math.min(endLine, total));
  return lines.slice(start - 1, end).join('\n');
};

/**
 * Collects the 1-based line numbers covered by `segments`, clamped to `1..total`.
 *
 * An inverted range (`startLine > endLine`, reachable from a hallucinated AI response or stale
 * cache) yields a non-positive length, which `Array.from` treats as 0 — such a segment covers
 * nothing, matching {@link extractLines}' handling of the same input.
 */
const _coveredLineNumbers = (segments: CachedSegment[], total: number): Set<number> =>
  new Set(segments.flatMap((segment) => {
    const start = Math.max(1, segment.startLine);
    const end = Math.min(segment.endLine, total);
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  }));

/**
 * Repairs AI-returned segment ranges so that they cover `1..lines.length` contiguously.
 *
 * `segmentChatlogs` regularly returns ranges that leave part of the body uncovered (measured on
 * avalon: 10 of 18 runs lost at least one non-blank line, at the head, the tail and in between).
 * Uncovered lines are silently dropped by {@link extractLines}' clamping, so they never surface as
 * an error. This function closes those holes before the ranges reach the cache.
 *
 * Repair strategy, after sorting by `startLine` ascending and clamping each `startLine` to
 * `1..lines.length`:
 *
 * - the first segment starts at line 1 (head hole)
 * - the last segment ends at `lines.length` (tail hole)
 * - an interior hole is closed by extending the **preceding** segment's `endLine` up to
 *   `nextStartLine - 1`; the following segment's `startLine` is left untouched
 *
 * Guaranteed invariants: the returned ranges cover `1..lines.length` with no gap and no overlap,
 * the segment count is unchanged (never merged nor split), and `title` / `summary` are untouched.
 *
 * `repairedNonBlankLines` reports only lines whose `trim()` is non-empty. Blank lines left
 * uncovered (the leading blank after frontmatter removal, or the trailing `''` produced by
 * `split('\n')`) cause no data loss, so counting them would inflate the warning.
 *
 * @param lines - the body split into lines; line `n` is `lines[n - 1]`
 * @param segments - the AI-decided segment boundaries, in any order
 * @returns `segments`, repaired and in ascending `startLine` order, and `repairedNonBlankLines`,
 *          the ascending 1-based numbers of the non-blank lines the repair recovered
 */
export const repairSegmentCoverage = (
  lines: string[],
  segments: CachedSegment[],
): { segments: CachedSegment[]; repairedNonBlankLines: number[] } => {
  const _total = lines.length;
  // Nothing to cover, or nothing to cover it with: return the input untouched so that the
  // "segment count is unchanged" invariant holds. (`segments` empty is already rejected upstream
  // by `_processChunk`; reporting every line as repaired here would be a false positive.)
  if (_total === 0 || segments.length === 0) {
    return { segments: [...segments], repairedNonBlankLines: [] };
  }
  const _sorted = [...segments].sort((a, b) => a.startLine - b.startLine);
  const _covered = _coveredLineNumbers(_sorted, _total);
  const _repairedNonBlankLines = lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line, lineNumber }) => !_covered.has(lineNumber) && line.trim() !== '')
    .map(({ lineNumber }) => lineNumber);
  const _starts = _sorted.map((segment) => Math.min(Math.max(segment.startLine, 1), _total));
  const _repaired = _sorted.map((segment, index) => ({
    ...segment,
    startLine: index === 0 ? 1 : _starts[index],
    endLine: index === _sorted.length - 1 ? _total : _starts[index + 1] - 1,
  }));
  return { segments: _repaired, repairedNonBlankLines: _repairedNonBlankLines };
};
