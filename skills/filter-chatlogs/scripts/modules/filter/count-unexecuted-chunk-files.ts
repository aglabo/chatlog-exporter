// src: scripts/modules/filter/count-unexecuted-chunk-files.ts
// @(#): レートリミット abort により未実行のまま残ったチャンクのファイル数を集計する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// 未実行チャンク集計
// ─────────────────────────────────────────────

/**
 * `runChunked` の結果配列を検査し、未実行（穴）のまま残ったチャンクに含まれる
 * ファイル数の合計を返す。
 *
 * `withConcurrency` は `ctl.abort()` 後の未着手タスクを実行しないため、結果配列の
 * 該当インデックスは未代入（穴）のまま残る。`i in chunkResults` で判定できる
 * （`true`=実行済み、`false`=穴＝未実行）。
 *
 * `items` は `createChunkedTasks`（concurrency.ts）と同じ規則
 * （`items.slice(i * chunkSize, (i + 1) * chunkSize)`）でチャンク化して対応付ける。
 *
 * @param items - チャンク分割前の全ファイルパス配列
 * @param chunkSize - チャンクサイズ
 * @param chunkResults - `runChunked` の戻り値（穴を含みうる配列）
 * @returns 未実行チャンクに含まれるファイル数の合計
 */
export const countUnexecutedChunkFiles = <R>(
  items: string[],
  chunkSize: number,
  chunkResults: R[],
): number => {
  const chunkCount = Math.ceil(items.length / chunkSize);
  return Array.from({ length: chunkCount })
    .map((_, i) => (i in chunkResults ? 0 : items.slice(i * chunkSize, (i + 1) * chunkSize).length))
    .reduce((sum, count) => sum + count, 0);
};
