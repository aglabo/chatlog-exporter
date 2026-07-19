// src: scripts/types/load-classify-entry.types.ts
// @(#): loadClassifyEntry 読み込み失敗結果の型定義
//       対象: LoadClassifyEntryFailure
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `loadClassifyEntry` の読み込み失敗結果。 */
export interface LoadClassifyEntryFailure {
  filePath: string;
  error: Error;
}
