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

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export interface ParsedConfig {
  /** フロントマターを付与する対象ディレクトリのパス。 */
  targetDir?: string;
  /** 辞書ファイルが置かれたディレクトリのパス。 */
  dicsDir?: string;
  /** `true` のときファイルを書き換えずに処理結果のみ表示する。 */
  dryRun?: boolean;
  /** `true` のときレビューフェーズ（Phase 3）をスキップする。 */
  noReview?: boolean;
  /** `--config` で指定された設定ファイルのパス。 */
  configFile?: string;
}

/** `buildConfig` が返す完全な設定（すべてのフィールドが必須）。 */
export interface SetfmConfig {
  /** フロントマターを付与する対象ディレクトリのパス。 */
  targetDir: string;
  /** 辞書ファイルが置かれたディレクトリのパス。 */
  dicsDir: string;
  /** `true` のときファイルを書き換えずに処理結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときレビューフェーズ（Phase 3）を実行する。 */
  review: boolean;
  /** 同時実行する並列タスク数の上限。 */
  concurrency: number;
}
