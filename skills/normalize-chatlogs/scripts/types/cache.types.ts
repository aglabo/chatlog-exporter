// src: scripts/types/cache.types.ts
// @(#): normalize-chatlogs キャッシュデータ型定義
//       対象: NormalizeCache
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/** ChatlogCache が保存する正規化済み判定結果。 */
export interface NormalizeCache {
  /** 正規化処理が完了済みであることを示す。 */
  status: 'done';
  /** AI が決定したセグメント分割設定（再分割に使用）。summary は含まない（再分割時は空文字で出力する）。 */
  segments?: Array<{
    title: string;
    startLine: number;
    endLine: number;
  }>;
}
