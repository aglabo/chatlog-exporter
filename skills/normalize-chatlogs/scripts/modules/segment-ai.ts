// src: scripts/modules/segment-ai.ts
// @(#): AI 呼び出しによるチャットログのトピック別セグメント分割
//       対象: segmentChatlogs, extractLines
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules ───────────────────────────────────────────────────────────

// classes
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';

// functions
// --- ai ---
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// constants
import { DEFAULT_AI_MODEL } from '../../../_scripts/constants/defaults.constants.ts';

// --- io ---
import { logger } from '../../../_scripts/libs/io/logger.ts';

// --- text ---
import { parseAiJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// --- path ---
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── internasl modules
// types
import type { SegmentPlan } from '../types/normalize.types.ts';

// constants
import { MAX_SEGMENTS } from '../constants/normalize.constants.ts';

// ─── Line Number Helpers ──────────────────────────────────────────────────────

const _addLineNumbers = (content: string): string => {
  if (!content) { return ''; }
  return content.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
};

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

// ─── AI Execution ─────────────────────────────────────────────────────────────

/** AI が返す行番号範囲方式のセグメント定義。export しない内部型。 */
type _AiSegmentRange = {
  title: string;
  summary: string;
  startLine: number;
  endLine: number;
};

/**
 * Splits multiple chatlogs into topic-based segments in a single AI call.
 *
 * Sends all inputs to Claude as a combined prompt and returns a Map from
 * filePath to its planned segment boundaries. Returns null for any filePath that the AI
 * did not return results for, or if the AI call fails entirely.
 *
 * Line numbers (`startLine`/`endLine`) refer to `entry.content` (frontmatter excluded),
 * not the raw file. Building the actual `content` from these boundaries is the caller's
 * responsibility (see {@link phaseWrite}).
 *
 * @param inputs   - Array of `ChatlogEntry` to segment
 * @param options  - Optional AI options (model, timeoutMs, signal)
 * @returns Map from filePath to SegmentPlan[] or null
 */
export const segmentChatlogs = async (
  inputs: ChatlogEntry[],
  options?: { model?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<Map<string, SegmentPlan[] | null>> => {
  const _nullMap = (): Map<string, SegmentPlan[] | null> => {
    const m = new Map<string, SegmentPlan[] | null>();
    for (const entry of inputs) { m.set(entry.filePath!, null); }
    return m;
  };

  const systemPrompt = 'You are a chatlog analyst. Split each given chatlog into 1 to 5 broad topic segments.\n'
    + 'If the conversation covers only one topic, return exactly 1 segment covering the full content.\n'
    + 'Never return an empty segments array — always return at least 1 segment per file.\n'
    + 'Group minor subtopics under the nearest major theme — do NOT create a segment per small exchange.\n'
    + 'Return ONLY a JSON array where each element has exactly two fields:\n'
    + '"filePath" (the file path as given) and "segments" (array of segment objects).\n'
    + 'Each segment object has exactly four fields:\n'
    + '"title" (short topic title, 5 words or fewer),\n'
    + '"summary" (one-sentence summary),\n'
    + '"startLine" (integer, 1-based, inclusive),\n'
    + '"endLine" (integer, 1-based, inclusive).\n'
    + 'Ranges must be contiguous and non-overlapping. Cover the full conversation.\n'
    + 'Do not include any explanation or markdown fences — respond with the JSON array only.';

  const userPrompt = inputs
    .map((entry, i) => `File ${i + 1}: ${entry.filePath}\n${_addLineNumbers(entry.content)}`)
    .join('\n\n---\n\n');

  let _raw: string;
  try {
    _raw = await runAI(systemPrompt, userPrompt, {
      model: options?.model ?? DEFAULT_AI_MODEL,
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    });
  } catch (e) {
    if (e instanceof ChatlogError && e.kind === 'AiError' && e.subindex === 'RateLimit') {
      throw e;
    }
    const _paths = inputs.map((entry) => getBasename(entry.filePath!)).join(', ');
    if (e instanceof ChatlogError && e.kind === 'TimedOut') {
      logger.warn(`segmentChatlogs: timed out — ${_paths}`);
    } else {
      logger.warn(`segmentChatlogs: AI error — ${_paths}`);
    }
    return _nullMap();
  }

  const _parsed = parseAiJsonArray(_raw);
  if (_parsed === null) {
    const _paths = inputs.map((entry) => getBasename(entry.filePath!)).join(', ');
    logger.warn(`segmentChatlogs: invalid JSON response — ${_paths}`);
    return _nullMap();
  }

  const _validPaths = new Set(inputs.map((entry) => entry.filePath));
  const _result = new Map<string, SegmentPlan[] | null>();
  for (const entry of inputs) { _result.set(entry.filePath!, null); }

  for (const aiEntry of _parsed as Array<{ filePath: string; segments: _AiSegmentRange[] }>) {
    if (!_validPaths.has(aiEntry.filePath)) { continue; }
    const _segments = Array.isArray(aiEntry.segments) ? aiEntry.segments : [];
    _result.set(
      aiEntry.filePath,
      _segments.slice(0, MAX_SEGMENTS).map((r) => ({
        title: r.title,
        summary: r.summary,
        startLine: r.startLine,
        endLine: r.endLine,
      })),
    );
  }

  // null のまま残ったファイルまたは空セグメントのファイルに対してログ出力
  for (const entry of inputs) {
    const filePath = entry.filePath!;
    const _segments = _result.get(filePath);
    if (_segments && _segments.length > 0) { continue; }
    const _aiEntry = (_parsed as Array<{ filePath: string; segments: unknown[] }>)
      .find((e) => e.filePath === filePath);
    if (!_aiEntry) {
      logger.warn(`segmentChatlogs: no entry returned for — ${getBasename(filePath)}`);
    } else {
      logger.warn(`segmentChatlogs: empty segments returned for — ${getBasename(filePath)}`);
    }
  }

  return _result;
};
