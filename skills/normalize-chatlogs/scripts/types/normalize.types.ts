// src: skills/normalize-chatlogs/scripts/types/normalize.types.ts
// @(#): normalize-chatlogs 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

export interface NormalizeConfig {
  chatlogsDir?: string;
  baseDir?: string;
  agent?: string;
  period?: string;
  dryRun: boolean;
  concurrency: number;
  normalizeDir?: string;
}

export type NormalizeParsedConfig = Partial<NormalizeConfig> & {
  configFile?: string;
};
