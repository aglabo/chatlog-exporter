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
import type { PrefilterConfig } from '../types/prefilter.types.ts';

// ─────────────────────────────────────────────
// filter-chatlog 固有定数
// ─────────────────────────────────────────────

/** DISCARD 判定に必要な最低信頼度スコア。 */
export const DISCARD_THRESHOLD = 0.7;

/** バッチプロンプトに含める本文の最大文字数。 */
export const MAX_BODY_CHARS = 8000;

/** isExcludedByContent のコンテンツ最小文字数フィルタ閾値。 */
export const MIN_CHAR_COUNT = 1000;

/** isExcludedByContent の Assistant 応答最小文字数閾値（userTurns=1 時）。 */
export const MIN_ASSISTANT_CHARS_CONTENT = 300;

/** prefilter-chatlog の Assistant 応答最小文字数閾値（userTurns=1 時）。 */
export const MIN_ASSISTANT_CHARS = 100;

/** prefilter-chatlog の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_PREFILTER_CONFIG: PrefilterConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOG_DIR,
  dryRun: false,
  report: false,
};

/** filter-chatlog の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  agent: DEFAULT_AGENT,
  inputDir: DEFAULT_CHATLOG_DIR,
  dryRun: false,
  // config.yaml only
  chunkSize: DEFAULT_CHUNK_SIZE,
  concurrency: DEFAULT_CONCURRENCY,
  minCharCount: MIN_CHAR_COUNT,
  minAssistantChars: MIN_ASSISTANT_CHARS_CONTENT,
  discardThreshold: DISCARD_THRESHOLD,
};
