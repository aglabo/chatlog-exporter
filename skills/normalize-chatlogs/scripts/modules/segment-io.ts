// src: scripts/modules/segment-io.ts
// @(#): セグメント分割・ファイル生成・フロントマター付与に関する関数群
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules ───────────────────────────────────────────────────────────

// -- classes --
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { ChatlogFrontmatter } from '../../../_scripts/classes/ChatlogFrontmatter.class.ts';

// -- types --
import type { HashProvider } from '../../../_scripts/types/providers.types.ts';

// -- ai --
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';

// -- io --
import { generateHash } from '../../../_scripts/libs/io/hash.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';

// -- text --
import { parseJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// -- local types --
import type { Segment } from '../types/normalize.types.ts';

// -- local constants --
import { MAX_SEGMENTS } from '../constants/normalize.constants.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── ID Generation ────────────────────────────────────────────────────────────

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
export const extractBaseName = (filePath: string): string => {
  const fileName = filePath.split('/').pop() ?? filePath;
  const withoutExt = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
  // Remove trailing -<7hex> hash if present
  return withoutExt.replace(/-[0-9a-f]{7}$/, '');
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
  const baseName = extractBaseName(filePath);
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
 * serialises it via `toFrontmatter()`, and prepends the result to `content`.
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

// ─── AI Execution ─────────────────────────────────────────────────────────────

/**
 * Splits a chatlog into topic-based segments by calling the Claude AI.
 *
 * Sends the chatlog content to Claude with a system prompt requesting a JSON
 * array of segments. Each segment has `title`, `summary`, and `body` fields.
 * At most {@link MAX_SEGMENTS} segments are returned.
 *
 * @param filePath - Path to the chatlog file (used for context in the prompt)
 * @param content  - Full text content of the chatlog file
 * @returns Promise resolving to an array of {@link Segment} objects, or `null`
 *          if the AI call fails or the response cannot be parsed as a JSON array
 */
export const segmentChatlogs = async (filePath: string, content: string): Promise<Segment[] | null> => {
  const systemPrompt = 'You are a chatlog analyst. Split the given chatlog into topic-based segments. '
    + 'Return ONLY a JSON array where each element has exactly three string fields: '
    + '"title" (short topic title), "summary" (one-sentence summary), and "content" (relevant text). '
    + 'For "content": copy the relevant conversation verbatim — do NOT rewrite, paraphrase, or reformat. '
    + 'Preserve all original line breaks, blank lines, code blocks, and list formatting exactly as they appear. '
    + 'Preserve ### User and ### Assistant headings to distinguish speakers. '
    + 'Do not include any explanation or markdown fences — respond with the JSON array only.';

  const userPrompt = `File: ${filePath}\n\n${content}`;

  let raw: string;
  try {
    raw = await runAI(systemPrompt, userPrompt, { model: 'claude-sonnet-4-6' });
  } catch (e) {
    if (e instanceof ChatlogError && e.kind === 'TimedOut') {
      logger.warn(`segmentChatlogs: timed out — ${filePath}`);
    }
    return null;
  }

  const parsed = parseJsonArray(raw);
  if (parsed === null) {
    return null;
  }

  const segments = parsed as Segment[];
  return segments.slice(0, MAX_SEGMENTS);
};
