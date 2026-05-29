// src: scripts/types/phase.types.ts
// @(#): set-frontmatter フェーズ処理関連型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// フェーズ結果型
// ─────────────────────────────────────────────

/** チャットログの種別を表す文字列型。辞書の `key` フィールドの値が入る。 */
export type LogType = string;

/** type 判定フェーズ（Phase 1）の1ファイル分の結果。 */
export interface TypeResult {
  /** 対象ファイルのフルパス。 */
  file: string;
  /** AI が判定したログ種別。 */
  type: LogType;
}

/** フロントマター生成フェーズ（Phase 2）の1ファイル分の結果。 */
export interface FrontmatterResult {
  /** 対象ファイルのフルパス。 */
  file: string;
  /** AI が判定したログ種別。 */
  type: LogType;
  /** AI が判定したカテゴリ。 */
  category: string;
  /** 生成されたフロントマター YAML 文字列。 */
  yaml: string;
}

/** レビューフェーズ（Phase 3）の1ファイル分の結果。 */
export interface ReviewResult {
  /** 対象ファイルのフルパス。 */
  file: string;
  /** レビュー判定結果。`'pass'` は問題なし、`'fail'` は修正あり。 */
  validity: 'pass' | 'fail';
  /** `validity === 'fail'` のときのエラーメッセージ一覧。 */
  errors: string[];
  /** レビュー後に修正された種別。`validity === 'pass'` のときは元の値と同じ。 */
  correctedType: string;
  /** レビュー後に修正されたカテゴリ。`validity === 'pass'` のときは元の値と同じ。 */
  correctedCategory: string;
  /** レビュー後に修正されたフロントマター YAML 文字列。 */
  correctedYaml: string;
}

// ─────────────────────────────────────────────
// 処理統計型
// ─────────────────────────────────────────────

/** 処理全体の集計カウンター。`main` 関数が完了時に出力する。 */
export interface Stats {
  /** 処理対象ファイルの総数。 */
  total: number;
  /** フロントマターの書き込みに成功したファイル数。 */
  success: number;
  /** 処理に失敗したファイル数（AI エラー・書き込みエラー等）。 */
  fail: number;
  /** スキップされたファイル数（dryRun 等）。 */
  skip: number;
}
