// src: scripts/constants/classify.constants.ts
// @(#): classify-chatlogs スクリプト固有の定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { DEFAULT_AGENT, DEFAULT_AI_MODEL } from '../../../_scripts/constants/defaults.constants.ts';
import type { ClassifyConfig } from '../types/classify.types.ts';

// ─────────────────────────────────────────────
// classify-chatlogs 固有定数
// ─────────────────────────────────────────────

/** プロジェクトが特定できなかった場合に割り当てるフォールバックプロジェクト名。 */
export const FALLBACK_PROJECT = 'misc';

/** プロジェクト辞書ファイルのデフォルトパス。 */
export const DEFAULT_PROJECTS_DIC_PATH = './assets/configs/projects.dic';

/** フロントマターなし時に分類を試みる最低本文長（文字数）。これ未満は misc に直接分類する。 */
export const MIN_CLASSIFIABLE_LENGTH = 50;

/** parseArgs で未指定のフィールドに適用するデフォルト設定。 */
export const DEFAULT_CLASSIFY_CONFIG: ClassifyConfig = {
  agent: DEFAULT_AGENT,
  dryRun: false,
  baseDir: './chatlogs',
  dicsDir: './assets/dics',
  model: DEFAULT_AI_MODEL,
};
