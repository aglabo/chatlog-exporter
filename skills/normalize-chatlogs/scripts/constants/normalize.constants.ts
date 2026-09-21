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
