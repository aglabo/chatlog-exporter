// src: skills/normalize-chatlogs/scripts/types/load-entry.types.ts
// @(#): loadEntry 読み込み失敗結果の型定義
//       対象: LoadEntryFailure
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** `loadEntry` の読み込み失敗結果。 */
export interface LoadEntryFailure {
  filePath: string;
  error: Error;
}
