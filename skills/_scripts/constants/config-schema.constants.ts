// src: skills/_scripts/constants/config-schema.constants.ts
// @(#): GlobalConfig スキーマ定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  DEFAULT_CACHE_ROOT,
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_DICS_DIR,
  DEFAULT_MAX_RETRY,
  DEFAULT_PROJECTS_DIC_PATH,
  DEFAULT_PROMPTS_DIR,
} from './defaults.constants.ts';
// types
import type { ConfigSchema, ConfigValues } from '../types/config-schema.types.ts';

/** GlobalConfig のデフォルトスキーマ。登録済みキーと型を定義する。 */
export const DEFAULT_CONFIG_SCHEMA: ConfigSchema = {
  /** 使用する AI エージェント識別子。例: "claude", "chatgpt" */
  agent: 'string',
  /** 使用するモデル名またはエイリアス。例: "sonnet", "opus" */
  model: 'string',
  /** AI 実行タイムアウト (ms)。0 = タイムアウトなし。 */
  timeoutMs: 'number',
  /** generateHash が返す16進数文字列の長さ。 */
  hashLength: 'number',
  /** ランダム文字列生成の最小長。 */
  minRandomLength: 'number',
  /** ランダム文字列生成の最大長。 */
  maxRandomLength: 'number',
  /** バッチリクエスト1回あたりの最大ファイル数。 */
  chunkSize: 'number',
  /** 同時実行する並列タスク数の上限。 */
  concurrency: 'number',
  /** コンテンツ最小文字数フィルタ閾値。 */
  minCharCount: 'number',
  /** Assistant 応答最小文字数閾値（userTurns=1 時）。 */
  minAssistantChars: 'number',
  /** コンテンツ最大文字数フィルタ閾値。 */
  maxContentLength: 'number',
  /** DISCARD 判定に必要な最低信頼度スコア（filter-chatlog 使用）。 */
  discardThreshold: 'number',
  /** 辞書ファイルが置かれたディレクトリのパス。 */
  dicsDir: 'string',
  /** プロジェクト分類辞書ファイルのパス。classify-chatlogs が使用する。 */
  projectsDic: 'string',
  /** プロンプトテンプレートが置かれたディレクトリのパス。 */
  promptsDir: 'string',
  /** チャットログの入出力ディレクトリのパス。 */
  chatlogsDir: 'string',
  /** キャッシュルートディレクトリのパス。 */
  cacheDir: 'string',
  /** runAI の最大リトライ回数（0=リトライなし、上限 10）。 */
  maxRetry: 'number',
};

/** DEFAULT_CONFIG_SCHEMA のキーのユニオン型。 */
export type ConfigKey = keyof typeof DEFAULT_CONFIG_SCHEMA;

/** GlobalConfig のデフォルト値。DEFAULT_CONFIG_SCHEMA のすべてのキーに対する初期値を持つ。 */
export const DEFAULT_CONFIG_VALUES = {
  /** デフォルトエージェントは "claude" */
  agent: 'claude',
  /** デフォルトモデルは "sonnet" */
  model: 'sonnet',
  /** デフォルトタイムアウトは 120,000 ms（2分） */
  timeoutMs: 120_000,
  /** デフォルトハッシュ長は 8 文字 */
  hashLength: 8,
  /** ランダム文字列の最小長は 4 文字 */
  minRandomLength: 4,
  /** ランダム文字列の最大長は 16 文字 */
  maxRandomLength: 16,
  /** デフォルトチャンクサイズは 10 ファイル */
  chunkSize: 10,
  /** デフォルト並列数は 4 タスク */
  concurrency: 4,
  /** デフォルト辞書ディレクトリ */
  dicsDir: DEFAULT_DICS_DIR,
  /** デフォルトプロジェクト辞書パス */
  projectsDic: DEFAULT_PROJECTS_DIC_PATH,
  /** デフォルトプロンプトディレクトリ */
  promptsDir: DEFAULT_PROMPTS_DIR,
  /** デフォルトチャットログディレクトリ */
  chatlogsDir: DEFAULT_CHATLOGS_DIR,
  /** デフォルトキャッシュルートディレクトリ */
  cacheDir: DEFAULT_CACHE_ROOT,
  /** デフォルトコンテンツ最小文字数 */
  minCharCount: 1000,
  /** デフォルト Assistant 応答最小文字数 */
  minAssistantChars: 300,
  /** デフォルトコンテンツ最大文字数 */
  maxContentLength: 4000,
  /** デフォルト DISCARD 閾値 */
  discardThreshold: 0.7,
  /** デフォルト最大リトライ回数 */
  maxRetry: DEFAULT_MAX_RETRY,
} as const satisfies ConfigValues;
