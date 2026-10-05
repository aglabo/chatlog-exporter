// src: _cle-libs/constants/defaults.constants.ts
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

/** `--config` 未指定時に読み込む既定の設定ファイル名。`configDir` 相対。 */
export const DEFAULT_CONFIG_FILE = 'config.yaml';

// ─────────────────────────────────────────────
// ディレクトリ
// ─────────────────────────────────────────────

/** config.yaml の chatlogsDir に対応するデフォルトのチャットログ出力ディレクトリ。 */
export const DEFAULT_CHATLOGS_DIR = './chatlogs';

/** normalize-chatlogs が出力するセグメントのデフォルトベースディレクトリ。 */
export const DEFAULT_NORMALIZE_DIR = 'normalizeLogs';

/** export-chatlogs が出力先に付加するサブディレクトリ名。`chatlogsDir` と `joinPath()` で組み合わせて使用する。 */
export const DEFAULT_ORIGINAL_LOGS_DIR = 'originalLogs';

/** set-frontmatter が出力するデフォルトディレクトリ。 */
export const DEFAULT_OUTPUT_DIR = 'outputLogs';

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

/** 1 チャンクあたりの最大ファイル数。 */
export const DEFAULT_BATCH_SIZE = 4;

/**
 * 1 チャンクあたりの累積 content 文字数の上限。0 = 無制限。
 *
 * 既定 20000 の根拠: `_addLineNumbers` の行番号付与は 1 行あたり +3.87 tok
 * （旧仕様の `"%5d: "` パディングでは +5.87 tok/行。avalon の `POST /tokenize` 実測）。
 * 718 行 / 33,287 字のログで本文 14,429 tok → 行番号付与後 17,205 tok（+2,776 = 718 行 × 3.87）。
 * 同じ行あたり値を 20,000 字（約 431 行）へ当てると本文 ≈ 8,700 tok → 付与後 ≈ 10,400 tok。
 * プロンプト処理 93.4 tok/s 実測で PP 約 110 秒 + 生成 約 65 秒 ≈ 175 秒（`timeoutMs: 300_000` に余裕 125 秒）。
 * 倍率（付与後 ÷ 本文）は平均行長に依存して動くため指標に使わない。行あたりトークン数で見積もる。
 *
 * `0` の意味が `DEFAULT_MAX_BODY_CHARS` とは逆である点に注意する。
 * こちらの `0` は「チャンクを文字数で打ち切らない」= 無制限（スキーマも `min: 0`）だが、
 * あちらの `0` は本文が空になるため無効（スキーマは `min: 1`）。
 */
export const DEFAULT_MAX_BATCH_CHARS = 20000;

/**
 * バッチプロンプトへ埋め込むチャットログ 1 本分の本文の最大文字数。
 *
 * 既定 8000 の根拠: 設定可能化より前に filter-chatlogs がハードコードしていた本文上限と同値にしてある。
 * 設定可能にしても既定のままなら振る舞いは変わらない。**この組み込み既定は実測値ではない。**
 *
 * 配布する `.config/chatlog-exporter/config.yaml` の `maxBodyChars` もこの既定と同じ 8000 にしてある。
 * 2026-09-29 に時間ゲートの実測で config を 10000 へ上げたが、2026-10-05 の判定品質の実測
 * （`cle-kju.3.3.5`、レポート §5.3）で 8000 へ戻した。10000 は KEEP/DISCARD 判定を改善せず
 * （人手確認で改善 1 件・悪化 3 件）、応答要素数不一致による ERR が 60 件中 22〜24 件から 39 件へ増えた。
 * error 率の対策（`cle-kju.3.3.12`）が済んだら再測する。
 *
 * 時間ゲート上の上限は 10000（品質上の理由で採っていない。`measurements-context-limits-2026-09-29.md`）:
 * 合格線は 1 リクエスト <= 180 秒（`timeoutMs: 300_000` に対し 120 秒の余裕。`maxRetry: 2` =
 * 最大 3 試行なので余裕は 1 試行あたりで確保する）。`chunkSize: 2` との積がそのままプロンプト長になる。
 *
 * - プロンプト処理時間は線形ではない。実測 4,993-16,498 tok の 12 点に
 *   `t(n) = 9.8437n + 3.518e-4·n²` [ms] が誤差 1.58 秒以内で当たる（tok/s は 86.7 → 63.8 と落ちる）
 * - `chunkSize 2` × 10000 は cold 実測 3 本で 109.6 / 110.0 / 136.2 秒。PP は 109 秒で安定し、
 *   生成側に 71 秒の余裕が残る
 * - 12000 は 155.4 / 165.8 / 193.8 秒で 3 本中 1 本がゲートを超えた。PP は 136 秒で安定しており、
 *   ばらつきはすべて生成側（249 / 416 / 749 tok）。サーバの `temperature` が 1.0 で
 *   `max_tokens` を送らない（DR-15）ため生成長が安定せず、PP の余裕を 44 秒しか残せない 12000 では
 *   ゲート超過を防げない
 * - スループットはコーパス全体（n=3,739）で 8000 比 1.29 倍。切り詰め率は 68.2% → 42.0%
 *
 * @see docs/.deckrd/libs/ai-backend/workspaces/measurements-context-limits-2026-09-29.md
 *
 * `0` は無制限ではなく無効とする（スキーマは `min: 1`）。
 * `renderConversation(conv, 0)` は空文字列を返すため、`0` を許すと本文が空のまま
 * 判定へ送られ、全件 DISCARD が起こりうる。
 * 「`0` = 無制限」として扱う `DEFAULT_MAX_BATCH_CHARS` とは意味が異なる。
 */
export const DEFAULT_MAX_BODY_CHARS = 8000;

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
