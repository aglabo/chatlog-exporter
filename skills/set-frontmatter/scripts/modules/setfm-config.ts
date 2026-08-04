// src: scripts/modules/setfm-config.ts
// @(#): set-frontmatter 引数解析・設定構築モジュール
//       対象: parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { parseArgs } from '../../../_cle-libs/libs/io/parse-args.ts';
import { isAbsolutePath, joinPath } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// constants
import { DEFAULT_CONFIG_VALUES } from '../../../_cle-libs/constants/config-schema.constants.ts';
// types
import type { ArgSchema } from '../../../_cle-libs/types/args-schema.types.ts';

// ─── Local
// types
import type { SetfmConfig } from '../types/args.types.ts';

/** set-frontmatter の引数スキーマ。 */
const _SCHEMA: ArgSchema<SetfmConfig> = [
  { option: '--dics', field: 'dicsDir', type: 'directory' },
  { option: '--prompts', field: 'promptsDir', type: 'directory' },
  { option: '--review', field: 'review', type: 'flag' },
  { option: '--concurrency', field: 'concurrency', type: 'integer', min: 1 },
  { option: '--cache-dir', field: 'cacheDir', type: 'string' },
];

/** `buildConfig` のデフォルト値。GlobalConfig スキーマにないフィールドのみここで補う。 */
const _DEFAULT_SETFM_CONFIG: SetfmConfig = {
  ...DEFAULT_CONFIG_VALUES,
  inputDir: '',
  outputDir: 'outputLogs',
  dryRun: false,
  review: true,
};

/**
 * CLI 引数・GlobalConfig から完全な SetfmConfig を構築する。
 * - `parseArgs`（共通ライブラリ）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの `SetfmConfig` を返す。
 * - outputDir: 絶対パスならそのまま使用、相対パスなら `joinPath(chatlogsDir, outputDir)`、
 *   未指定なら `joinPath(chatlogsDir, 'outputLogs')` に解決する。
 * - dicsDir/promptsDir/cacheDir はパス解決を行わず、値をそのまま透過する。
 * - concurrency の範囲検証（1 以上）は `_SCHEMA` の `min: 1` に委譲する。
 */
export const buildConfig = (
  args: string[],
  defaults?: SetfmConfig,
): SetfmConfig => {
  const _defaults = defaults ?? _DEFAULT_SETFM_CONFIG;
  const _parsed = parseArgs<SetfmConfig>(args, _SCHEMA, _defaults);
  const _outputDir = _parsed.outputDir
    ? (isAbsolutePath(_parsed.outputDir) ? _parsed.outputDir : joinPath(_parsed.chatlogsDir, _parsed.outputDir))
    : joinPath(_parsed.chatlogsDir, 'outputLogs');
  return { ..._parsed, outputDir: _outputDir };
};
