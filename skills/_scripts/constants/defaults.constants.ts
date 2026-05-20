// src: _scripts/constants/defaults.constants.ts
// @(#): 全スクリプト共通のデフォルト値定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { KnownAgent } from './agents.constants.ts';

// ─────────────────────────────────────────────
// 設定ファイル
// ─────────────────────────────────────────────

/** GlobalConfig が読み込むデフォルト設定ファイルパス。 */
export const DEFAULT_CONFIG_FILE = 'assets/configs/config.yaml';

// ─────────────────────────────────────────────
// ディレクトリ
// ─────────────────────────────────────────────

/** config.yaml の chatlogsDir に対応するデフォルトのチャットログ出力ディレクトリ。 */
export const DEFAULT_CHATLOGS_DIR = './chatlogs';

/** normalize-chatlogs が出力するセグメントのデフォルトベースディレクトリ。 */
export const DEFAULT_NORMALIZE_DIR = './chatlogs/normalizelogs';

// ─────────────────────────────────────────────
// エージェント
// ─────────────────────────────────────────────

/** CLI でエージェントが指定されなかった場合のデフォルトエージェント名。 */
export const DEFAULT_AGENT: KnownAgent = 'claude';

// ─────────────────────────────────────────────
// AI 実行系
// ─────────────────────────────────────────────

/** runAI のデフォルトモデル。 */
export const DEFAULT_AI_MODEL = 'sonnet';

/** runAI のデフォルトタイムアウト (ms)。0 = タイムアウトなし。 */
export const DEFAULT_TIMEOUT_MS = 120_000;

// ─────────────────────────────────────────────
// 並列処理・バッチ処理系
// ─────────────────────────────────────────────

/** Claude CLI へのバッチリクエスト 1 回あたりの最大ファイル数。 */
export const DEFAULT_CHUNK_SIZE = 10;

/** 同時実行するタスクの最大並列数。 */
export const DEFAULT_CONCURRENCY = 4;

// ─────────────────────────────────────────────
// ハッシュ生成系
// ─────────────────────────────────────────────

/** generateHash の length パラメータのデフォルト値。 */
export const DEFAULT_HASH_LENGTH = 8;

/** _buildRandomString が生成するランダム文字列の最小長。 */
export const MIN_RANDOM_LENGTH = 4;

/** generateHash の maxRandomLength パラメータのデフォルト値。 */
export const DEFAULT_MAX_RANDOM_LENGTH = 16;
