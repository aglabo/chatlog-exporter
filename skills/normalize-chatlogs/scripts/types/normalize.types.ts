// src: skills/normalize-chatlogs/scripts/types/normalize.types.ts
// @(#): normalize-chatlogs 型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { DefaultArgFields, ParsedArgs } from '../../../_cle-libs/types/args-schema.types.ts';

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
  /** AI が返した開始行番号（1-based、キャッシュ保存用）。 */
  startLine?: number;
  /** AI が返した終了行番号（1-based、キャッシュ保存用）。 */
  endLine?: number;
};

/**
 * {@link segmentChatlogs} の戻り値要素。`Segment` から `content` を除いた形。
 *
 * `segmentChatlogs` は AI が返した行番号範囲のみを決定し、`content` の算出（元テキストの
 * 再スライス）は行わない。実際の `content` 算出は呼び出し元（phaseWrite）の責務。
 */
export type SegmentPlan = Omit<Segment, 'content'>;

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
 * バッチ処理結果の集計カウンター。{@link writeSegmentToFile} が直接更新する。
 */
export type Stats = {
  /** セグメント分割成功で書き込み完了したファイル数。 */
  success: number;
  /** AI がセグメント分割できなかった件数（segments 未返却）。 */
  fail: number;
  /** 既に分割済み（既正規化ファイル）でスキップされた件数。 */
  done: number;
  /** エントリー読み込み失敗などシステムエラーの件数。 */
  error: number;
  /** dry-run による分割スキップの件数。 */
  skip: number;
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

/** T が ArgValue 互換であることをコンパイル時に強制するための恒等型。 */
type _Assert<T extends Partial<ParsedArgs>> = T;

/** NormalizeConfig が ArgValue 互換であることの型チェック（実行時に影響なし）。 */
type _NormalizeConfigCheck = _Assert<NormalizeConfig>;
