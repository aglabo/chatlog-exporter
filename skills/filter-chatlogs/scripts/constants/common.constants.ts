// src: scripts/constants/common.constants.ts
// @(#): filter-chatlogs スクリプト固有の定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_cle-libs/constants/config-schema.constants.ts';
import { DEFAULT_AGENT, DEFAULT_CHATLOGS_DIR } from '../../../_cle-libs/constants/defaults.constants.ts';

// ─── internal ───
// types
import type { FilterConfig } from '../types/filter.types.ts';
import type { NoiseFilterConfig } from '../types/noise-filter.types.ts';
import type { StripConfig } from '../types/strip-config.types.ts';

// ─────────────────────────────────────────────
// filter-chatlogs 固有定数
// ─────────────────────────────────────────────

/** バッチプロンプトに含める本文の最大文字数。 */
export const MAX_BODY_CHARS = 8000;

/**
 * strip の退避先に付加する拡張子。`backupToBak` が生成する `<path>.bak` と対応する。
 *
 * 退避パスの構成（`` `${path}${BAK_SUFFIX}` ``）と、退避パスから本体パスへの復元
 * （`` path.slice(0, -BAK_SUFFIX.length) ``）の双方で用いる。両者で値がずれると
 * 復帰（R-015）と包含検査（R-013）が同時に成立しなくなるため、定義を 1 箇所に集約する。
 *
 * **glob の絞り込みには使わないこと**。`.bak` で列挙するとエディタ等が作った
 * `notes.bak` まで拾うため、列挙には `.md.bak` を用いる（DR-23 決定 1）。
 */
export const BAK_SUFFIX = '.bak';

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

/** strip-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_STRIP_CONFIG: StripConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  dryRun: false,
  recoverOrphans: false,
  // config.yaml only
  concurrency: DEFAULT_CONFIG_VALUES.concurrency,
};

/** filter-chatlogs の parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  agent: DEFAULT_AGENT,
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  dryRun: false,
  singleFile: false,
  // config.yaml only
  chunkSize: DEFAULT_CONFIG_VALUES.chunkSize,
  concurrency: DEFAULT_CONFIG_VALUES.concurrency,
  minCharCount: DEFAULT_CONFIG_VALUES.minCharCount,
  minAssistantChars: DEFAULT_CONFIG_VALUES.minAssistantChars,
  discardThreshold: DEFAULT_CONFIG_VALUES.discardThreshold,
};
