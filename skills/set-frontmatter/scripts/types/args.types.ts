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
  /** チャットログを読み込む入力ディレクトリのパス。 */
  inputDir: string;
  /** フロントマター付きファイルの書き込み先ディレクトリのパス。 */
  targetDir: string;
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
  /** バッチリクエスト1回あたりの最大ファイル数。 */
  chunkSize: number;
  /** フェーズ単位のキャッシュファイルを格納するディレクトリのパス。 */
  cacheDir: string;
}

/** `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。`concurrency` は GlobalConfig で管理するため除外。 */
export type ParsedConfig = Omit<Partial<SetfmConfig>, 'concurrency'> & {
  /** `--config` で指定された設定ファイルのパス。省略時は `undefined`。 */
  configFile?: string;
};
