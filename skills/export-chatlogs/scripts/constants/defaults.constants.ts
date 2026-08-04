// src: scripts/constants/defaults.ts
// @(#): デフォルト値の定数定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared modules ─────────────────────────────────────────────────────────
// constants
import { DEFAULT_AGENT, DEFAULT_CONCURRENCY } from '../../../_cle-libs/constants/defaults.constants.ts';

// ─── Local modules ───────────────────────────────────────────────────────────
// types
import type { ExportConfig } from '../types/export-config.types.ts';

/**
 * `parseArgs()` が引数なしで呼ばれた場合に返す `ExportConfig` のデフォルト値。
 *
 * `parseArgs()` はこのオブジェクトをスプレッドコピーしてベースとし、
 * CLI 引数で指定された値で上書きしていく。
 * `exportDir`・`period`・`inputDir` は省略値（undefined）のままになる。
 *
 * @see parseArgs
 * @see ExportConfig
 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  agent: DEFAULT_AGENT,
  concurrency: DEFAULT_CONCURRENCY,
};
