// src: scripts/configs/strip-config.ts
// @(#): strip-chatlogs の引数解析・設定構築
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { parseArgs } from '../../../_cle-libs/libs/io/parse-args.ts';
// types
import type { ArgSchema } from '../../../_cle-libs/types/args-schema.types.ts';

// ─── internal ───
// constants
import { DEFAULT_STRIP_CONFIG } from '../constants/common.constants.ts';
// types
import type { StripConfig, StripParsedConfig } from '../types/strip-config.types.ts';

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * strip-chatlogs の引数スキーマ。
 *
 * `--recover-orphans` のみを定義する。`period` / `agent` / `--dry-run` / `--input-dir` は
 * 共通 `parseArgs` の `_DEFAULT_ARG_SCHEMA` が供給するため再定義しない。
 * 本スキーマは strip 側に閉じており、`filter` / `noise-filter` の引数解析には影響しない（DD-04）。
 */
const _SCHEMA: ArgSchema<StripParsedConfig> = [
  { option: '--recover-orphans', field: 'recoverOrphans', type: 'flag' },
];

/**
 * CLI 引数から完全な StripConfig を構築する。
 *
 * - `parseArgs`（共通ライブラリ）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの設定を返すため、
 *   GlobalConfig の値を個別に再取得しない。
 * - `dryRun` / `recoverOrphans` は未指定時 `false` になる。
 * - `configFile` は StripConfig に存在しないため結果から除外する。
 */
export const buildConfig = (
  args: string[],
  defaults: StripConfig = DEFAULT_STRIP_CONFIG,
): StripConfig => {
  const _parsed = parseArgs<StripParsedConfig>(args, _SCHEMA, defaults);
  _parsed.dryRun ??= false;
  _parsed.recoverOrphans ??= false;
  const { configFile: _configFile, ...rest } = _parsed;
  return { ...rest } as StripConfig;
};
