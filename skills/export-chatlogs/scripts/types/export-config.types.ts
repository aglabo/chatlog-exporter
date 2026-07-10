// src: scripts/types/export-config.types.ts
// @(#): エクスポート実行設定の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';

// --- type

/**
 * `parseArgs()` が CLI 引数から生成するエクスポート実行設定。
 *
 * `main()` 関数がこの設定を受け取り、エージェント選択・期間フィルタ・
 * 出力先パスを決定する。`DEFAULT_EXPORT_CONFIG` がデフォルト値のベースになる。
 *
 * `agent`・`period`・`configFile`・`dryRun`・`inputDir`・`outputDir` は
 * 共通スキーマ由来の `DefaultArgFields` から供給される。
 * `outputDir` は export-chatlogs では使用せず破棄する。
 *
 * @see parseArgs
 * @see main
 * @see DEFAULT_EXPORT_CONFIG
 */
export type ExportConfig = DefaultArgFields & {
  /** 対象エージェント名。"claude" または "codex" */
  agent: string;
  /**
   * 入力ベースディレクトリ（将来拡張用）。
   * 省略時は `homeDir()` を基点として各エージェントのデフォルトパスを使用する。
   */
  baseDir?: string;
  /** 出力先ディレクトリのベースパス。デフォルトは "./chatlogs" */
  exportDir: string;
  /** GlobalConfig から解決されたチャットログディレクトリ。`exportDir` 未指定時のフォールバック元。 */
  chatlogsDir?: string;
};

/**
 * `parseArgs()` が CLI 引数から生成する未解決設定。`buildConfig()` が完全な `ExportConfig` に解決する。
 */
export type ParsedConfig = Partial<ExportConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** ExportConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _ExportConfigCheck = _Assert<ExportConfig>;
