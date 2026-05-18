// src: skills/normalize-chatlogs/scripts/types/normalize.types.ts
// @(#): normalize-chatlogs 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * {@link segmentChatlogs} が AI から受け取る 1 トピックセグメント。
 *
 * AI は chatlog の内容を複数のトピックに分割し、各トピックをこの形式で返す。
 */
export type Segment = {
  /** セグメントの短いトピックタイトル。 */
  title: string;
  /** セグメントの 1 文要約。 */
  summary: string;
  /** セグメントの会話本文（元テキストをそのままコピー）。 */
  content: string;
};

/**
 * バッチ処理結果の集計カウンター。{@link writeOutput} が直接更新する。
 */
export type Stats = {
  /** 正常に書き込まれたファイル数。 */
  success: number;
  /** スキップされたファイル数。 */
  skip: number;
  /** 失敗したファイル数（AI エラー・書き込みエラー等）。 */
  fail: number;
};

export interface NormalizeConfig {
  chatlogsDir?: string;
  baseDir?: string;
  agent?: string;
  period?: string;
  dryRun: boolean;
  concurrency: number;
  normalizeDir?: string;
}

export type NormalizeParsedConfig = Partial<NormalizeConfig> & {
  configFile?: string;
};
