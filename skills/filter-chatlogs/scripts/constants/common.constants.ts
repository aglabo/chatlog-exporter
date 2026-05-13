// src: scripts/constants/common.constants.ts
// @(#): filter-chatlogs スクリプト固有の定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { DEFAULT_AGENT, DEFAULT_CHATLOGS_DIR } from '../../../_scripts/constants/defaults.constants.ts';
import { DEFAULT_VALUES } from '../../../_scripts/constants/schema.constants.ts';
import type { FilterConfig } from '../types/filter.types.ts';
import type { PrefilterConfig } from '../types/prefilter.types.ts';

// ─────────────────────────────────────────────
// filter-chatlogs 固有定数
// ─────────────────────────────────────────────

/** バッチプロンプトに含める本文の最大文字数。 */
export const MAX_BODY_CHARS = 8000;

/** prefilter-chatlogs の Assistant 応答最小文字数閾値（userTurns=1 時）。 */
export const MIN_ASSISTANT_CHARS = 100;

/** prefilter-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_PREFILTER_CONFIG: PrefilterConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  dryRun: false,
  report: false,
};

/** filter-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  agent: DEFAULT_AGENT,
  dryRun: false,
  // config.yaml only
  chunkSize: DEFAULT_VALUES.chunkSize as number,
  concurrency: DEFAULT_VALUES.concurrency as number,
  minCharCount: DEFAULT_VALUES.minCharCount as number,
  minAssistantChars: DEFAULT_VALUES.minAssistantChars as number,
  discardThreshold: DEFAULT_VALUES.discardThreshold as number,
};
