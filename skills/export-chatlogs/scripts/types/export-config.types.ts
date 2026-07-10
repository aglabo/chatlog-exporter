// src: scripts/types/export-config.types.ts
// @(#): エクスポート実行設定の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * `parseArgs()` が CLI 引数から生成するエクスポート実行設定。
 *
 * `main()` 関数がこの設定を受け取り、エージェント選択・期間フィルタ・
 * 出力先パスを決定する。`DEFAULT_EXPORT_CONFIG` がデフォルト値のベースになる。
 *
 * @see parseArgs
 * @see main
 * @see DEFAULT_EXPORT_CONFIG
 */
export interface ExportConfig {
  /** 対象エージェント名。"claude" または "codex" */
  agent: string;
  /**
   * エクスポート対象期間。
   * "YYYY-MM"（月指定）または "YYYY"（年指定）の文字列。
   * 省略時は全期間が対象となる。
   */
  period?: string;
  /**
   * 入力ベースディレクトリ（将来拡張用）。
   * 省略時は `homeDir()` を基点として各エージェントのデフォルトパスを使用する。
   */
  baseDir?: string;
  /**
   * ChatGPT エクスポートディレクトリ。`chatgpt` エージェント使用時に `baseDir` より優先される。
   */
  inputDir?: string;
  /** 出力先ディレクトリのベースパス。デフォルトは "./chatlogs" */
  exportDir: string;
  /** dry-run モード。`--dry-run` オプションの解析結果を保持する（現状 `main()` 側での書き込みスキップは未実装）。 */
  dryRun?: boolean;
}

/**
 * `parseArgs()` が CLI 引数から生成する未解決設定。`buildConfig()` が完全な `ExportConfig` に解決する。
 *
 * `configFile` は `GlobalConfig.getInstance()` に渡す設定ファイルパスを保持する専用フィールドであり、
 * `ExportConfig` には含まれない。
 * `chatlogsDir` は共通 `parseArgs()` が GlobalConfig からマージする値を受け取る専用フィールドであり、
 * `ExportConfig` には含まれない（`exportDir` の算出にのみ使用する）。
 * `outputDir` は共通スキーマ（`--output-dir`）が書き込む専用フィールドであり、
 * `ExportConfig` には含まれない（export-chatlogs では使用せず破棄する）。
 */
export type ParsedConfig = Partial<ExportConfig> & {
  /** グローバル設定ファイルのパス。`--config` オプションで指定する。 */
  configFile?: string;
  /** GlobalConfig から解決されたチャットログディレクトリ。`exportDir` 未指定時のフォールバック元。 */
  chatlogsDir?: string;
  /** 共通スキーマの `--output-dir` が書き込む値。export-chatlogs では使用せず破棄する。 */
  outputDir?: string;
};
