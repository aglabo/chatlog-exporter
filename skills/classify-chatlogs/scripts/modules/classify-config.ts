// src: scripts/modules/classify-config.ts
// @(#): classify-chatlogs 引数解析・設定構築モジュール
//       対象: parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
import { DEFAULT_CONFIG_VALUES } from '../../../_cle-libs/constants/config-schema.constants.ts';
import { isValidModel } from '../../../_cle-libs/libs/ai/model-utils.ts';
import { parseArgs } from '../../../_cle-libs/libs/io/parse-args.ts';
// types
import type { ArgSchema } from '../../../_cle-libs/types/args-schema.types.ts';

// ─── Local
// types
import type { ClassifyConfig } from '../types/classify.types.ts';
// constants
import { DEFAULT_CLASSIFY_CONFIG } from '../constants/classify.constants.ts';

// ─── internal
/** classify-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgSchema<Partial<ClassifyConfig>> = [
  { option: '--period', field: 'period', type: 'period' },
  { option: '--model', field: 'model', type: 'string' },
];

/**
 * projectsDic が既定値のままなら dicsDir 配下の projects.dic に寄せる。
 * パス解決（configDir との結合）は行わず、生のパス文字列を格納する。
 * 実際のパス解決は `loadProjectDic` 内の `resolveConfigPath` に一元化されている。
 */
const _deriveProjectsDic = (config: ClassifyConfig): ClassifyConfig => {
  if (config.projectsDic !== DEFAULT_CONFIG_VALUES.projectsDic) {
    return config;
  }
  return {
    ...config,
    projectsDic: `${config.dicsDir}/projects.dic`,
  };
};

/**
 * CLI 引数から完全な ClassifyConfig を構築する。
 * - `parseArgsToConfig`（共通ライブラリの `parseArgs`）が CLI 引数・GlobalConfig・defaults を
 *   「CLI > GlobalConfig > defaults」の優先度で内部マージ済みの `ClassifyParsedConfig` を返すため、
 *   GlobalConfig の値を個別に再取得しない。
 * - `model` は `isValidModel` で検証し、不正なモデル名は `ChatlogError('InvalidArgs', 'InvalidModel')` をスローする。
 */
export const buildConfig = (
  args: string[],
  defaults?: ClassifyConfig,
): ClassifyConfig => {
  const _defaults = defaults ?? DEFAULT_CLASSIFY_CONFIG;
  const parsed = parseArgs<ClassifyConfig>(args, _SCHEMA, _defaults) as ClassifyConfig;

  const _model = parsed.model;
  if (!isValidModel(_model)) {
    throw new ChatlogError('InvalidArgs', 'InvalidModel', `不正なモデル名: ${parsed.model}`);
  }
  return _deriveProjectsDic(parsed);
};
