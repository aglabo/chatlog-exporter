// src: scripts/constants/common.constants.ts
// @(#): filter-chatlogs スクリプト固有の定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_scripts/constants/config-schema.constants.ts';
import { DEFAULT_AGENT, DEFAULT_CHATLOGS_DIR } from '../../../_scripts/constants/defaults.constants.ts';

// ─── internal ───
// types
import type { FilterConfig } from '../types/filter.types.ts';
import type { NoiseFilterConfig } from '../types/noise-filter.types.ts';

// ─────────────────────────────────────────────
// filter-chatlogs 固有定数
// ─────────────────────────────────────────────

/** バッチプロンプトに含める本文の最大文字数。 */
export const MAX_BODY_CHARS = 8000;

/** noise-filter-chatlogs の Assistant 応答最小文字数閾値（userTurns=1 時）。 */
export const MIN_ASSISTANT_CHARS = 100;

/** noise-filter-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_NOISE_FILTER_CONFIG: NoiseFilterConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  dryRun: false,
  // config.yaml only
  minCharCount: DEFAULT_CONFIG_VALUES.minCharCount,
  minAssistantChars: DEFAULT_CONFIG_VALUES.minAssistantChars,
  concurrency: DEFAULT_CONFIG_VALUES.concurrency,
};

/** filter-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  dryRun: false,
  // config.yaml only
  chunkSize: DEFAULT_CONFIG_VALUES.chunkSize,
  concurrency: DEFAULT_CONFIG_VALUES.concurrency,
  minCharCount: DEFAULT_CONFIG_VALUES.minCharCount,
  minAssistantChars: DEFAULT_CONFIG_VALUES.minAssistantChars,
  discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold,
};
