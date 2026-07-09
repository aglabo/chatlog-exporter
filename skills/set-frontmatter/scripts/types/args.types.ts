// src: scripts/types/args.types.ts
// @(#): set-frontmatter コマンドライン引数型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─────────────────────────────────────────────
// 設定型
// ─────────────────────────────────────────────

/** `buildConfig` が返す完全な設定（すべてのフィールドが必須）。 */
export interface SetfmConfig {
  /**
   * チャットログを読み込む入力ディレクトリのパス。
   * `--input-dir` 明示指定時のみ `buildConfig` が値を持つ（未指定時は空文字列）。
   * 実際の入力ディレクトリは `main()` が `resolveChatlogsDir` で解決する。
   */
  inputDir: string;
  /** フロントマター付きファイルの書き込み先ディレクトリのパス。 */
  outputDir: string;
  /** 対象エージェント名。 */
  agent: string;
  /** 絞り込み対象の期間（`YYYY` または `YYYY-MM`）。未指定時は全期間対象。 */
  period?: string;
  /** チャットログの基準ディレクトリのパス（GlobalConfig 由来）。 */
  chatlogsDir: string;
  /** 辞書ファイルが置かれたディレクトリのパス。 */
  dicsDir: string;
  /** プロンプトファイルが置かれたディレクトリのパス。 */
  promptsDir: string;
  /** `true` のときファイルを書き換えずに処理結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときレビューフェーズ（Phase 3）を実行する。 */
  review: boolean;
  /** 同時実行する並列タスク数の上限。 */
  concurrency: number;
  /** AI 呼び出し失敗時の最大リトライ回数（0=リトライなし、上限 10）。 */
  maxRetry: number;
  /** フェーズ単位のキャッシュファイルを格納するディレクトリのパス。 */
  cacheDir: string;
}

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type ParsedConfig = Partial<SetfmConfig> & {
  /** `--config` で指定された設定ファイルのパス。省略時は `undefined`。 */
  configFile?: string;
};
