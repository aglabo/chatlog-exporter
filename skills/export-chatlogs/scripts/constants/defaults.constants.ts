// src: scripts/constants/defaults.ts
// @(#): デフォルト値の定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// constants
import { DEFAULT_AGENT, DEFAULT_CHATLOGS_DIR } from '../../../_scripts/constants/defaults.constants.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { ExportConfig } from '../types/export-config.types.ts';

/**
 * CLI で `--output` が指定されなかった場合のデフォルト出力ディレクトリ。
 *
 * `parseArgs()` が引数なしで呼ばれた場合のフォールバック値として使用する。
 * スクリプト実行ディレクトリ配下の `chatlogs/` に出力される。
 *
 * @see parseArgs
 */
export const DEFAULT_OUTPUT_DIR = DEFAULT_CHATLOGS_DIR;

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
  outputDir: DEFAULT_OUTPUT_DIR,
};
