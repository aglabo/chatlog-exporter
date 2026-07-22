// src: scripts/modules/segment-io.ts
// @(#): セグメントファイル生成・フロントマター付与・ファイル書き出しに関する関数群
//       対象: extractSegmentBaseName, toCacheKey, generateOutputFileName, generateSegmentFile, attachFrontmatter, writeSegmentToFile
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

// --- io ---
import { generateHash } from '../../../_scripts/libs/io/hash.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';

// --- path ---
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── internasl modules
// types
import type { Segment, Stats } from '../types/normalize.types.ts';

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

/** Derives a cache key from a source chatlog file path (same normalization as {@link extractSegmentBaseName}). */
export const toCacheKey = (filePath: string): string => extractSegmentBaseName(filePath);

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
 * Sets AI-generated fields (`title`, `log_id`) onto `frontmatter`,
 * serialize it via `toFrontmatter()`, and prepends the result to `content`.
 *
 * @param content - The Markdown body to attach frontmatter to
 * @param frontmatter - `ChatlogFrontmatter` instance propagated from the source file
 * @param segmentMeta - AI-generated fields (`title`, `log_id`)
 * @returns Markdown string with frontmatter prepended
 */
export const attachFrontmatter = (
  content: string,
  frontmatter: ChatlogFrontmatter,
  segmentMeta: { title: string; log_id: string },
): string => {
  frontmatter.set('title', segmentMeta.title);
  frontmatter.set('log_id', segmentMeta.log_id);
  const fmText = frontmatter.toFrontmatter(_ATTACH_FIELD_ORDER, { addTagHashes: true });
  return `${fmText}\n${content}`;
};

// ─── Segment File Write ───────────────────────────────────────────────────────

/**
 * Writes a single segment to an output file.
 *
 * Generates the output file name from `filePath` and `index`, builds the full Markdown content
 * with frontmatter attached, then either logs a dryRun skip or delegates to {@link writeOutput}
 * (which handles atomic write via tmp-rename and backup of existing files).
 *
 * @param outputDir  - Directory in which the output file is written
 * @param filePath   - Source chatlog file path (used to derive the output file name)
 * @param index      - Zero-based segment index (used to derive the output file name)
 * @param segment    - Segment data (title, summary, content)
 * @param frontmatter - ChatlogFrontmatter instance from the source file
 * @param dryRun     - When true, no disk writes are performed; logs a "would write" message and increments `stats.skip`
 * @param stats      - Mutable counters updated in place
 * @param hashFn     - Optional hash generator for output file names (injectable for testing)
 * @returns The absolute path of the (would-be) written output file
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
  });
  const outputPath = `${outputDir}/${outputFileName}`;
  if (outputPath.includes(filePath)) {
    throw new ChatlogError(
      'ForbiddenOutput',
      'OverwriteInput',
      `writing to input file is forbidden: ${outputPath}`,
    );
  }
  if (dryRun) {
    logger.dryrun(`skipped written: ${outputPath}`);
    stats.skip++;
    return outputPath;
  }
  const written = await writeOutput(outputPath, fullContent, false);
  if (written) { stats.success++; }
  return outputPath;
};
