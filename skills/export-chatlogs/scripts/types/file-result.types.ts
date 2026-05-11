// src: scripts/types/file-result.types.ts
// @(#): ファイル単位処理の結果型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * conversations ファイル1件を処理した結果。
 * 複数ファイルを並列処理した後、ExportResult にマージするために使う。
 */
export type FileResult = {
  outputPaths: string[];
  skippedCount: number;
  errorCount: number;
};
