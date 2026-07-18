// src: scripts/types/load-filter-entry.types.ts
// @(#): loadFilterEntry 読み込み失敗結果の型定義
//       対象: LoadFilterEntryFailure
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `loadFilterEntry` の読み込み失敗結果。 */
export interface LoadFilterEntryFailure {
  filePath: string;
  error: Error;
}
