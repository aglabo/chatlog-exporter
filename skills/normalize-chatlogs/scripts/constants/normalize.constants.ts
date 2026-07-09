// src: skills/normalize-chatlogs/scripts/constants/normalize.constants.ts
// @(#): Constants for normalize-chatlogs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// constants
import { DEFAULT_CONCURRENCY, DEFAULT_NORMALIZE_DIR } from '../../../_scripts/constants/defaults.constants.ts';
// types
import type { NormalizeConfig } from '../types/normalize.types.ts';

// ─── Constants defintion

/** Default configuration for the normalize-chatlogs pipeline. */
export const DEFAULT_NORMALIZE_CONFIG: Partial<NormalizeConfig> = {
  dryRun: false,
  concurrency: DEFAULT_CONCURRENCY,
  outputDir: DEFAULT_NORMALIZE_DIR,
};

/** Maximum number of segments per file. Segments returned by the AI are truncated to this count. */
export const MAX_SEGMENTS = 5;

/** Maximum number of files processed in a single AI call. Larger values increase the risk of timeouts. */
export const BATCH_SIZE = 2;
