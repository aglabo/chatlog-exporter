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
import { parseArgs as parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';

// classes
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';

// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';

// constants
import { DEFAULT_CONCURRENCY } from '../../../_scripts/constants/defaults.constants.ts';

// --- internal
// types
import type { NormalizeConfig, NormalizeParsedConfig } from '../types/normalize.types.ts';

// constants
import { DEFAULT_NORMALIZE_CONFIG } from '../constants/normalize.constants.ts';

// --- local
// constants
const _SCHEMA: ArgsSchema<NormalizeParsedConfig> = [
  { option: '--agent', field: 'agent', type: 'agent' },
  { option: '--period', field: 'period', type: 'period' },
  { option: '--concurrency', field: 'concurrency', type: 'integer' },
  { option: '--timeout-ms', field: 'timeoutMs', type: 'integer' },
  { option: '--output-dir', field: 'outputDir', type: 'directory' },
  { option: '--fail-fast', field: 'failFast', type: 'flag' },
  { option: '--single-file', field: 'singleFile', type: 'flag' },
];

export const parseArgs = (args: string[]): NormalizeParsedConfig => {
  return parseArgsToConfig<NormalizeParsedConfig>(args, _SCHEMA);
};

export const buildConfig = (
  parsed: NormalizeParsedConfig,
  globalConfig: GlobalConfig,
  defaults: Partial<NormalizeConfig> = DEFAULT_NORMALIZE_CONFIG,
): NormalizeConfig => {
  const _chatlogsDir = globalConfig.get('chatlogsDir') as string;
  const { configFile: _configFile, ...rest } = parsed;
  return {
    ...defaults,
    ...rest,
    chatlogsDir: _chatlogsDir,
    inputDir: parsed.inputDir,
    outputDir: parsed.outputDir ?? defaults.outputDir,
    dryRun: parsed.dryRun ?? defaults.dryRun ?? false,
    concurrency: parsed.concurrency ?? defaults.concurrency ?? DEFAULT_CONCURRENCY,
  };
};
