// src: scripts/modules/segment-io.ts
// @(#): セグメント分割・ファイル生成・フロントマター付与・ファイル書き出しに関する関数群
//       対象: extractSegmentBaseName, generateOutputFileName, generateSegmentFile, attachFrontmatter, segmentChatlogs, _writeSegmentToFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules ───────────────────────────────────────────────────────────

// types
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';

// classes
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../_scripts/classes/ChatlogFrontmatter.class.ts';

// functions
// --- ai ---
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// constants
import { DEFAULT_AI_MODEL } from '../../../_scripts/constants/defaults.constants.ts';

// --- io ---
import { generateHash } from '../../../_scripts/libs/io/hash.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';

// --- text ---
import { parseAiJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// --- path ---
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── internasl modules
// types
import type { Segment, Stats } from '../types/normalize.types.ts';

// constants
import { MAX_SEGMENTS } from '../constants/normalize.constants.ts';

// functions
import { writeOutput } from './file-io.ts';

// ─── local
// constants
/** セグメントファイルの本文セクションを示す Markdown 見出し。 */
export const START_BODY_HEADING = '## Excerpt';

/** Field order used by {@link attachFrontmatter}, extending the default order with `log_id`. */
const _ATTACH_FIELD_ORDER = [
  'title',
  'date',
  'session_id',
  'project',
  'slug',
  'type',
  'category',
  'summary',
  'log_id',
  'topics',
  'tags',
];

/**
 * Extracts the base name (without extension and trailing hash) from a file path.
 *
 * Strips the directory, `.md` extension, and any trailing `-<7hex>` hash suffix.
 * For example: `path/to/2026-03-11-1-api-a4a84394.md` → `2026-03-11-1-api`
 * (hash removal applies when the suffix matches `-[0-9a-f]{7}$` pattern)
 *
 * @param filePath - Path to the source chatlog file
 * @returns Base name without extension and without trailing `-XXXXXXX` hash segment
 */
export const extractSegmentBaseName = (filePath: string): string => {
  // Remove directory and extension via getBasename, then strip trailing -<7hex> hash if present
  return getBasename(filePath).replace(/-[0-9a-f]{7}$/, '');
};

/**
 * Generates an output file name for a segment.
 *
 * Format: `<baseName>-<XX>-<hash7>.md`
 * - baseName: source file name without extension and without trailing hash
 * - XX: zero-padded two-digit sequential index (01-based)
 * - hash7: result of `hashFn` if provided, otherwise {@link generateHash}(baseName, { length: 7 })
 *
 * @param filePath - Path to the source chatlog file
 * @param index    - Zero-based segment index (displayed as 1-based two-digit number)
 * @param hashFn   - Optional hash generator (injectable for testing)
 * @returns Promise resolving to the output file name (including `.md` extension)
 */
export const generateOutputFileName = async (
  filePath: string,
  index: number,
  hashFn?: HashProvider,
): Promise<string> => {
  const baseName = extractSegmentBaseName(filePath);
  const xx = String(index + 1).padStart(2, '0');
  const hash7 = hashFn ? hashFn() : await generateHash(baseName, { length: 7 });
  return `${baseName}-${xx}-${hash7}.md`;
};

// ─── Segment File Generation ──────────────────────────────────────────────────

/**
 * Generates a Markdown string from a {@link Segment} object.
 *
 * Output structure:
 * ```markdown
 * ## Summary
 * {segment.summary}
 *
 * ## Excerpt
 * {segment.body}
 * ```
 *
 * Both section headings (`## Summary` and `## Excerpt`) are always emitted,
 * even when `summary` or `body` are empty strings.
 *
 * @param segment - The segment to render
 * @returns Markdown string containing the Summary and Excerpt sections
 */
export const generateSegmentFile = (segment: Segment): string => {
  return `## Summary\n\n${segment.summary}\n\n${START_BODY_HEADING}\n\n${segment.content}`;
};

/**
 * Attaches a YAML frontmatter block to the given Markdown content.
 *
 * Sets AI-generated fields (`title`, `log_id`, `summary`) onto `frontmatter`,
 * serialize it via `toFrontmatter()`, and prepends the result to `content`.
 *
 * @param content - The Markdown body to attach frontmatter to
 * @param frontmatter - `ChatlogFrontmatter` instance propagated from the source file
 * @param segmentMeta - AI-generated fields (`title`, `log_id`, `summary`)
 * @returns Markdown string with frontmatter prepended
 */
export const attachFrontmatter = (
  content: string,
  frontmatter: ChatlogFrontmatter,
  segmentMeta: { title: string; log_id: string; summary: string },
): string => {
  frontmatter.set('title', segmentMeta.title);
  frontmatter.set('log_id', segmentMeta.log_id);
  frontmatter.set('summary', segmentMeta.summary);
  const fmText = frontmatter.toFrontmatter(_ATTACH_FIELD_ORDER);
  return `${fmText}\n${content}`;
};

// ─── Line Number Helpers ──────────────────────────────────────────────────────

const _addLineNumbers = (content: string): string => {
  if (!content) { return ''; }
  return content.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
};

const _extractLines = (lines: string[], startLine: number, endLine: number): string => {
  const total = lines.length;
  if (total === 0) { return ''; }
  const start = Math.max(1, Math.min(startLine, total));
  const end = Math.max(start, Math.min(endLine, total));
  if (start > end) { return ''; }
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

/** バッチ処理用の入力1件。 */
export type ChatlogInput = {
  filePath: string;
  content: string;
};

/**
 * Splits multiple chatlogs into topic-based segments in a single AI call.
 *
 * Sends all inputs to Claude as a combined prompt and returns a Map from
 * filePath to its segments. Returns null for any filePath that the AI did not
 * return results for, or if the AI call fails entirely.
 *
 * @param inputs   - Array of `{ filePath, content }` to segment
 * @param options  - Optional AI options (model, timeoutMs)
 * @returns Map from filePath to Segment[] or null
 */
export const segmentChatlogs = async (
  inputs: ChatlogInput[],
  options?: { model?: string; timeoutMs?: number },
): Promise<Map<string, Segment[] | null>> => {
  const _nullMap = (): Map<string, Segment[] | null> => {
    const m = new Map<string, Segment[] | null>();
    for (const { filePath } of inputs) { m.set(filePath, null); }
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
    .map(({ filePath, content }, i) => `File ${i + 1}: ${filePath}\n${_addLineNumbers(content)}`)
    .join('\n\n---\n\n');

  let _raw: string;
  try {
    _raw = await runAI(systemPrompt, userPrompt, {
      model: options?.model ?? DEFAULT_AI_MODEL,
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
  } catch (e) {
    const _paths = inputs.map((i) => getBasename(i.filePath)).join(', ');
    if (e instanceof ChatlogError && e.kind === 'TimedOut') {
      logger.warn(`segmentChatlogs: timed out — ${_paths}`);
    } else {
      logger.warn(`segmentChatlogs: AI error — ${_paths}`);
    }
    return _nullMap();
  }

  const _parsed = parseAiJsonArray(_raw);
  if (_parsed === null) {
    const _paths = inputs.map((i) => getBasename(i.filePath)).join(', ');
    logger.warn(`segmentChatlogs: invalid JSON response — ${_paths}`);
    return _nullMap();
  }

  const _validPaths = new Set(inputs.map((i) => i.filePath));
  const _result = new Map<string, Segment[] | null>();
  for (const { filePath } of inputs) { _result.set(filePath, null); }

  for (const entry of _parsed as Array<{ filePath: string; segments: _AiSegmentRange[] }>) {
    if (!_validPaths.has(entry.filePath)) { continue; }
    const _inputContent = inputs.find((i) => i.filePath === entry.filePath)!.content;
    const _lines = _inputContent.split('\n');
    const _segments = Array.isArray(entry.segments) ? entry.segments : [];
    _result.set(
      entry.filePath,
      _segments.slice(0, MAX_SEGMENTS).map((r) => ({
        title: r.title,
        summary: r.summary,
        content: _extractLines(_lines, r.startLine, r.endLine),
      })),
    );
  }

  // null のまま残ったファイルまたは空セグメントのファイルに対してログ出力
  for (const { filePath } of inputs) {
    const _segments = _result.get(filePath);
    if (_segments && _segments.length > 0) { continue; }
    const _entry = (_parsed as Array<{ filePath: string; segments: unknown[] }>)
      .find((e) => e.filePath === filePath);
    if (!_entry) {
      logger.warn(`segmentChatlogs: no entry returned for — ${getBasename(filePath)}`);
    } else {
      logger.warn(`segmentChatlogs: empty segments returned for — ${getBasename(filePath)}`);
    }
  }

  return _result;
};

// ─── Segment File Write ───────────────────────────────────────────────────────

/**
 * Writes a single segment to an output file.
 *
 * Generates the output file name from `filePath` and `index`, builds the full Markdown content
 * with frontmatter attached, then delegates to {@link writeOutput} (which handles dryRun,
 * atomic write via tmp-rename, and backup of existing files).
 *
 * @param outputDir  - Directory in which the output file is written
 * @param filePath   - Source chatlog file path (used to derive the output file name)
 * @param index      - Zero-based segment index (used to derive the output file name)
 * @param segment    - Segment data (title, summary, content)
 * @param frontmatter - ChatlogFrontmatter instance from the source file
 * @param dryRun     - When true, no disk writes are performed
 * @param stats      - Mutable counters updated in place
 * @param hashFn     - Optional hash generator for output file names (injectable for testing)
 * @returns The absolute path of the written output file
 */
export const writeSegmentToFile = async (
  outputDir: string,
  filePath: string,
  index: number,
  segment: { title: string; summary: string; content: string },
  frontmatter: ChatlogFrontmatter,
  dryRun: boolean,
  stats: Stats,
  hashFn?: HashProvider,
): Promise<string> => {
  const outputFileName = await generateOutputFileName(filePath, index, hashFn);
  const segmentContent = generateSegmentFile(segment);
  const fullContent = attachFrontmatter(segmentContent, frontmatter, {
    title: segment.title,
    log_id: getBasename(outputFileName),
    summary: segment.summary,
  });
  const outputPath = `${outputDir}/${outputFileName}`;
  if (outputPath.includes(filePath)) {
    throw new ChatlogError(
      'ForbiddenOutput',
      'OverwriteInput',
      `writing to input file is forbidden: ${outputPath}`,
    );
  }
  const written = await writeOutput(outputPath, fullContent, dryRun);
  if (written) { stats.success++; }
  return outputPath;
};
