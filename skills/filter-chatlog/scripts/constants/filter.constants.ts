// src: scripts/constants/filter.constants.ts
// @(#): filter-chatlog スクリプト固有の定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  DEFAULT_AGENT,
  DEFAULT_CHATLOG_DIR,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CONCURRENCY,
} from '../../../_scripts/constants/defaults.constants.ts';
import type { FilterConfig } from '../types/filter.types.ts';

// ─────────────────────────────────────────────
// filter-chatlog 固有定数
// ─────────────────────────────────────────────

/** parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  agent: DEFAULT_AGENT,
  inputDir: DEFAULT_CHATLOG_DIR,
  dryRun: false,
  // config.yaml only
  chunkSize: DEFAULT_CHUNK_SIZE,
  concurrency: DEFAULT_CONCURRENCY,
};
