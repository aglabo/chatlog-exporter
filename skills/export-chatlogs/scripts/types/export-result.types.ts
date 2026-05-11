// src: scripts/types/export-result.types.ts
// @(#): エクスポート結果の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * exportClaude / exportCodex が返すエクスポート結果。
 */
export type ExportResult = {
  /** 書き出したセッション数 */
  exportedCount: number;
  /** スキップされたセッション数（parseSession が null を返した件数） */
  skippedCount: number;
  /** エラーになったセッション数（parseSession / writeSession が例外を投げた件数） */
  errorCount: number;
  /** 書き出した Markdown ファイルの絶対パス一覧 */
  outputPaths: string[];
};
