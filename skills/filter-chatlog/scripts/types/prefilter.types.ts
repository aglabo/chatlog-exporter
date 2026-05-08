// src: scripts/types/prefilter.types.ts
// @(#): prefilter-chatlog スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `prefilter-chatlog` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export interface PrefilterConfig {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** 対象年月（`YYYY-MM` 形式）。省略時は全期間。 */
  period?: string;
  /** チャットログが格納された入力ディレクトリのパス。 */
  inputDir: string;
  /** チャットログ基底ディレクトリのパス。省略時は `undefined`。 */
  chatlogsDir?: string;
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときノイズファイル一覧をタブ区切りで出力する（`dryRun` も暗示）。 */
  report: boolean;
}

/** `prefilter-chatlog` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type PrefilterParsedConfig = Partial<PrefilterConfig> & {
  configFile?: string;
};
