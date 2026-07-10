// src: scripts/constants/defaults.ts
// @(#): デフォルト値の定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// constants
import {
  DEFAULT_AGENT,
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_ORIGINAL_LOGS_DIR,
} from '../../../_scripts/constants/defaults.constants.ts';
// libs
import { joinPath } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { ExportConfig } from '../types/export-config.types.ts';

/**
 * CLI で `--export-dir` が指定されなかった場合のデフォルト出力ディレクトリ。
 *
 * `parseArgs()` が引数なしで呼ばれた場合のフォールバック値として使用する。
 * `chatlogsDir` 配下の `originalLogs/` に出力される。
 *
 * @see parseArgs
 */
export const DEFAULT_EXPORT_DIR = joinPath(DEFAULT_CHATLOGS_DIR, DEFAULT_ORIGINAL_LOGS_DIR);

/**
 * `parseArgs()` が引数なしで呼ばれた場合に返す `ExportConfig` のデフォルト値。
 *
 * `parseArgs()` はこのオブジェクトをスプレッドコピーしてベースとし、
 * CLI 引数で指定された値で上書きしていく。
 * `period` と `baseDir` は省略値（undefined）のままになる。
 *
 * @see parseArgs
 * @see ExportConfig
 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  agent: DEFAULT_AGENT,
  exportDir: DEFAULT_EXPORT_DIR,
};
