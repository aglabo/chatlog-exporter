// src: scripts/types/noise-filter.types.ts
// @(#): noise-filter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';

/** `noise-filter-chatlogs` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export type NoiseFilterConfig = DefaultArgFields & {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときノイズファイル一覧をタブ区切りで出力する（`dryRun` も暗示）。 */
  report: boolean;
};

/** `noise-filter-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type NoiseFilterParsedConfig = Partial<NoiseFilterConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** NoiseFilterConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _NoiseFilterConfigCheck = _Assert<NoiseFilterConfig>;
