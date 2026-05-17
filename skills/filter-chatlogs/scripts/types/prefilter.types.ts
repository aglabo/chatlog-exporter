// src: scripts/types/prefilter.types.ts
// @(#): prefilter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `prefilter-chatlogs` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export interface PrefilterConfig {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** 対象年月（`YYYY-MM` 形式）。省略時は全期間。 */
  period?: string;
  /** チャットログ基底ディレクトリのパス。`--base-dir` で指定するルートディレクトリ。 */
  baseDir?: string;
  /** チャットログ基底ディレクトリのパス。buildConfig 後のベースディレクトリ（GlobalConfig 由来 or --chatlogs-dir 直接指定）。 */
  chatlogsDir: string;
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときノイズファイル一覧をタブ区切りで出力する（`dryRun` も暗示）。 */
  report: boolean;
}

/** `prefilter-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type PrefilterParsedConfig = Partial<PrefilterConfig> & {
  configFile?: string;
};

/** prefilter 処理の統計情報。 */
export interface PrefilterStats {
  /** ノイズと判定し処理（削除 or 表示）したファイル数。 */
  noise: number;
  /** ノイズなしと判定し保持したファイル数。 */
  keep: number;
  /** 読み取りエラーや削除失敗が発生したファイル数。 */
  error: number;
}
