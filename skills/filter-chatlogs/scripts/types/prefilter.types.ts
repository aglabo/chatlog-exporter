// src: scripts/types/prefilter.types.ts
// @(#): prefilter-chatlogs スクリプト固有の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';

/** `prefilter-chatlogs` の `main` が使用する設定。すべてのフィールドに値が入る。 */
export type PrefilterConfig = DefaultArgFields & {
  /** 対象 AI エージェント名（例: `claude`, `chatgpt`）。 */
  agent: string;
  /** チャットログが格納された基準ディレクトリのパス（GlobalConfig の chatlogsDir 由来）。 */
  chatlogsDir: string;
  /** `true` のときファイルを削除せず判定結果のみ表示する。 */
  dryRun: boolean;
  /** `true` のときノイズファイル一覧をタブ区切りで出力する（`dryRun` も暗示）。 */
  report: boolean;
};

/** `prefilter-chatlogs` の `parseArgs` の戻り値型。引数で指定されたフィールドのみ含む。 */
export type PrefilterParsedConfig = Partial<PrefilterConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** PrefilterConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _PrefilterConfigCheck = _Assert<PrefilterConfig>;
