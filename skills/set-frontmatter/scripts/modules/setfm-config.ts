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
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';
import { parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
// constants
import { DEFAULT_DICS_DIR } from '../../../_scripts/constants/defaults.constants.ts';
// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';

// ─── Local
// types
import type { ParsedConfig, SetfmConfig } from '../types/args.types.ts';

/** set-frontmatter の引数スキーマ。 */
const _SCHEMA: ArgsSchema = [
  { option: '--target-dir', field: 'targetDir', type: 'directory' },
  { option: '--dics', field: 'dicsDir', type: 'directory' },
  { option: '--dry-run', field: 'dryRun', type: 'flag' },
  { option: '--review', field: 'review', type: 'flag' },
  { option: '--config', field: 'configFile', type: 'string' },
];

export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig(args, _SCHEMA) as unknown as ParsedConfig;
};

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な SetfmConfig を構築する。
 * - targetDir: `parsed.targetDir` が未指定なら `ChatlogError('InvalidArgs')` をスロー
 * - dicsDir 優先順位: `parsed.dicsDir` > `globalConfig.get('dicsDir')` > `DEFAULT_DICS_DIR`
 * - dryRun: `parsed.dryRun ?? false`
 * - review: `parsed.review ?? true` — デフォルト true
 * - concurrency: `globalConfig.get('concurrency') as number`
 */
export const buildConfig = (
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
): SetfmConfig => {
  if (!parsed.targetDir) {
    throw new ChatlogError(
      'InvalidArgs',
      'NotSpecified',
      'Usage: set_frontmatter.ts --target-dir <dir> [--dry-run] [--review] [--no-review] [--dics DIR] [--config FILE]',
    );
  }
  const _dicsDir = parsed.dicsDir ?? (globalConfig.get('dicsDir') as string | undefined) ?? DEFAULT_DICS_DIR;
  const _dryRun = parsed.dryRun ?? false;
  const _review = parsed.review ?? true;
  const _concurrency = globalConfig.get('concurrency') as number;
  return {
    targetDir: parsed.targetDir,
    dicsDir: _dicsDir,
    dryRun: _dryRun,
    review: _review,
    concurrency: _concurrency,
  };
};
