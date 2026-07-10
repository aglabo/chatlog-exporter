// src: skills/normalize-chatlogs/scripts/types/normalize.types.ts
// @(#): normalize-chatlogs 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_scripts/types/args-schema.types.ts';

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
 * バッチ処理でセグメント分割された1ファイル分の結果。
 * `filePath` と事前計算済みの `outputDir` を保持する。
 */
export type SegmentedFile = {
  /** 入力ファイルパス（outputFileName生成に使用）。 */
  filePath: string;
  /** resolveOutputDir で事前計算済みの出力ディレクトリ。 */
  outputDir: string;
  /** AIが生成したセグメント配列。 */
  segments: Segment[];
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
  /** AI 失敗 → 1セグメント強制で処理した件数（--single-file モード専用）。 */
  fallback: number;
};

export type NormalizeConfig = DefaultArgFields & {
  chatlogsDir: string;
  model?: string;
  timeoutMs?: number;
  dryRun: boolean;
  concurrency: number;
  failFast?: boolean;
  singleFile?: boolean;
};

export type NormalizeParsedConfig = Partial<NormalizeConfig>;

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** NormalizeConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _NormalizeConfigCheck = _Assert<NormalizeConfig>;
