// src: skills/normalize-chatlogs/scripts/modules/normalize-config.ts
// @(#): parseArgs と buildConfig の実装モジュール
//       対象: parseArgs, buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --- shared
// functions
import { parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';

// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';
import type { NormalizeConfig, NormalizeParsedConfig } from '../types/normalize.types.ts';

// constants
import { DEFAULT_CONCURRENCY } from '../../../_scripts/constants/defaults.constants.ts';
import { DEFAULT_NORMALIZE_CONFIG } from '../constants/normalize.constants.ts';

// --- internal

const _SCHEMA: ArgsSchema = [
  { option: '--chatlogs-dir', field: 'chatlogsDir', type: 'directory' },
  { option: '--base-dir', field: 'baseDir', type: 'directory' },
  { option: '--agent', field: 'agent', type: 'agent' },
  { option: '--period', field: 'period', type: 'period' },
  { option: '--config', field: 'configFile', type: 'string' },
  { option: '--dry-run', field: 'dryRun', type: 'flag' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
  { option: '--normalize-dir', field: 'normalizeDir', type: 'directory' },
];

export const parseArgs = (args: string[]): NormalizeParsedConfig => {
  return parseArgsToConfig<NormalizeParsedConfig>(args, _SCHEMA) as NormalizeParsedConfig;
};

export const buildConfig = (
  parsed: NormalizeParsedConfig,
  defaults: Partial<NormalizeConfig> = DEFAULT_NORMALIZE_CONFIG,
): NormalizeConfig => {
  const { configFile: _configFile, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    dryRun: parsed.dryRun ?? defaults.dryRun ?? false,
    concurrency: parsed.concurrency ?? defaults.concurrency ?? DEFAULT_CONCURRENCY,
  };
};
