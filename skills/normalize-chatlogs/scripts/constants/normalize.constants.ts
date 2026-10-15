// src: skills/normalize-chatlogs/scripts/constants/normalize.constants.ts
// @(#): Constants for normalize-chatlogs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// constants
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_BATCH_CHARS,
} from '../../../_cle-libs/constants/defaults.constants.ts';
// types
import type { NormalizeConfig } from '../types/normalize.types.ts';

// ─── Re-exports

export { DEFAULT_BATCH_SIZE, DEFAULT_MAX_BATCH_CHARS };

// ─── Constants defintion

/** Default configuration for the normalize-chatlogs pipeline. */
export const DEFAULT_NORMALIZE_CONFIG: Partial<NormalizeConfig> = {
  dryRun: false,
  concurrency: DEFAULT_CONCURRENCY,
  batchSize: DEFAULT_BATCH_SIZE,
  maxBatchChars: DEFAULT_MAX_BATCH_CHARS,
};

/** Maximum number of segments per file. Segments returned by the AI are truncated to this count. */
export const MAX_SEGMENTS = 5;

/**
 * Matches a normalized directory path that ENDS with a chatlogs-style month directory `<agent>/<yyyy>/<yyyy-mm>`.
 *
 * Captures: `1` = base directory before `<agent>` (may be empty), `2` = agent, `3` = year, `4` = period (`yyyy-mm`).
 * Anchored at both ends with a greedy prefix, so when the pattern occurs more than once the last (tail) occurrence wins.
 * After a match, the agent / year / month are validated; an unknown agent, a year mismatch between `<yyyy>` and
 * `<yyyy-mm>`, or a month outside 01-12 is rejected with ChatlogError(`InvalidPath`).
 */
export const CHATLOG_MONTH_DIR_PATTERN = /^(.*)\/([^/]+)\/(\d{4})\/(\d{4}-\d{2})$/;
