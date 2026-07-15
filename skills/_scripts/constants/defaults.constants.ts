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

/** アプリ名が指定されなかった場合のデフォルトアプリ名。`.config/<appName>/` の組み立てに使用する。 */
export const DEFAULT_APP_NAME = 'chatlog-exporter';

/** 設定ファイル取得基準ディレクトリ */
export const DEFAULT_CONFIG_DIR = `.config/${DEFAULT_APP_NAME}`;

// ─────────────────────────────────────────────
// ディレクトリ
// ─────────────────────────────────────────────

/** config.yaml の chatlogsDir に対応するデフォルトのチャットログ出力ディレクトリ。 */
export const DEFAULT_CHATLOGS_DIR = './chatlogs';

/** normalize-chatlogs が出力するセグメントのデフォルトベースディレクトリ。 */
export const DEFAULT_NORMALIZE_DIR = './chatlogs/normalizelogs';

/** export-chatlogs が出力先に付加するサブディレクトリ名。`chatlogsDir` と `joinPath()` で組み合わせて使用する。 */
export const DEFAULT_ORIGINAL_LOGS_DIR = 'originalLogs';

/** set-frontmatter が出力するデフォルトディレクトリ。 */
export const DEFAULT_OUTPUT_DIR = './outputLogs';

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

/** runAI の最大リトライ回数（0=リトライなし、上限 10）。 */
export const DEFAULT_MAX_RETRY = 2;

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

// ─────────────────────────────────────────────
// フロントマター判定フォールバック
// ─────────────────────────────────────────────

/** type 判定が失敗・不明のときのフォールバック type 値。 */
export const DEFAULT_FALLBACK_TYPE = 'research';

/** category 判定が失敗・不明のときのフォールバック category 値。 */
export const DEFAULT_FALLBACK_CATEGORY = 'development';

// ─────────────────────────────────────────────
// デフォルト設定ディレクトリー
// ─────────────────────────────────────────────

/** キャッシュルートディレクトリー */
export const DEFAULT_CACHE_ROOT = '${TEMP}/cle-cache';
