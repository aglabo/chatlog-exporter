// src: skills/normalize-chatlogs/scripts/constants/normalize.constants.ts
// @(#): normalize-chatlogs 定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { DEFAULT_CONCURRENCY, DEFAULT_NORMALIZE_DIR } from '../../../_scripts/constants/defaults.constants.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

export const DEFAULT_NORMALIZE_CONFIG: Partial<NormalizeConfig> = {
  dryRun: false,
  concurrency: DEFAULT_CONCURRENCY,
  normalizeDir: DEFAULT_NORMALIZE_DIR,
};

export const MAX_SEGMENTS = 10;
