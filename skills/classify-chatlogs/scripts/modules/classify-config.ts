// src: scripts/modules/classify-config.ts
// @(#): classify-chatlogs 引数解析・設定構築モジュール
//       対象: parseArgs / buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../_scripts/classes/GlobalConfig.class.ts';
import { isValidModel } from '../../../_scripts/libs/ai/model-utils.ts';
import { parseArgsToConfig } from '../../../_scripts/libs/io/parse-args.ts';
// types
import type { ArgsSchema } from '../../../_scripts/types/args-schema.types.ts';

// ─── Local
// types
import type { ClassifyConfig, ParsedConfig } from '../types/classify.types.ts';
// constants
import { DEFAULT_CLASSIFY_CONFIG } from '../constants/classify.constants.ts';

/** classify-chatlogs の引数スキーマ。 */
const _SCHEMA: ArgsSchema = [
  { option: '--period', field: 'period', type: 'period' },
  { option: '--model', field: 'model', type: 'string' },
];

export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig<ParsedConfig>(args, _SCHEMA) as ParsedConfig;
};

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な ClassifyConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - model 優先順位: `parsed.model` > `globalConfig.get('model')` > `defaults.model`
 * - baseDir 優先順位: `parsed.baseDir` > `globalConfig.get('chatlogsDir')` > `defaults.baseDir`
 * - chatlogsDir: `parsed.chatlogsDir`（指定時のみ設定される）
 * - dicsDir 優先順位: `globalConfig.get('dicsDir')` > `defaults.dicsDir`
 * - projectsDic 優先順位: `globalConfig.get('projectsDic')` > `defaults.projectsDic`（`dicsDir` とは独立）
 * - 不正なモデル名は `ChatlogError('InvalidArgs')` をスローする。
 * - `configFile` は ClassifyConfig に存在しないため結果に含まれない。
 */
export const buildConfig = (
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
  defaults?: ClassifyConfig,
): ClassifyConfig => {
  const _defaults = defaults ?? DEFAULT_CLASSIFY_CONFIG;
  const _model = parsed.model ?? globalConfig.get('model') as string;
  if (!isValidModel(_model)) {
    throw new ChatlogError('InvalidArgs', 'InvalidModel', `不正なモデル名: ${_model}`);
  }
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _dicsDir = globalConfig.get('dicsDir') as string;
  const _globalChatlogDir = globalConfig.get('chatlogsDir') as string;
  const _baseDir = parsed.baseDir ?? _globalChatlogDir;
  const _chatlogsDir = parsed.chatlogsDir;
  const _projectsDic = globalConfig.get('projectsDic') as string;
  const _chunkSize = globalConfig.get('chunkSize') as number;
  const _concurrency = globalConfig.get('concurrency') as number;
  const { configFile: _cf, ...rest } = parsed;
  return {
    ..._defaults,
    ...rest,
    agent: _agent,
    model: _model,
    dicsDir: _dicsDir,
    projectsDic: _projectsDic,
    baseDir: _baseDir,
    chatlogsDir: _chatlogsDir,
    chunkSize: _chunkSize,
    concurrency: _concurrency,
  };
};
