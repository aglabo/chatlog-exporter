// src: scripts/modules/filter/build-abort-skip-message.ts
// @(#): 中断により未実行のまま残ったチャンクの警告文言を、中断理由付きで組み立てる
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// functions
import { describeAbortReason } from '../../../../_cle-libs/libs/ai/abort-utils.ts';

// ─────────────────────────────────────────────
// 未実行チャンク警告
// ─────────────────────────────────────────────

/** 中断理由を特定できなかった場合に使う、バックエンド中立な既定文言。 */
const _DEFAULT_ABORT_REASON = 'AI 実行の中断';

/**
 * 中断で未実行のまま残ったチャンクについて、中断理由を含む警告文言を組み立てる。
 *
 * 中断理由は `processChunk` が返す `ChatlogError` の `subindex` が保持しており、
 * `runChunked` の戻り値経由でそのまま呼び出し元に届いている。ここではその戻り値から
 * 中断側のエラーを先頭順に 1 件だけ拾い、理由ラベルに変換する。
 *
 * 戻り値には JSON パース失敗（`InvalidFormat` / `JsonParse`）や空配列応答
 * （`InvalidFormat` / `EmptyArray`）のような続行側エラーも混在するため、
 * 単に最初の定義済み要素を採ってはならない。`describeAbortReason` が
 * 中断側にのみラベルを返すことで、続行側と未実行チャンク（穴＝`undefined` として走査される）は
 * 自動的に除外される。
 *
 * @param chunkResults - `runChunked` の戻り値（穴・続行側エラーを含みうる配列）
 * @param unexecutedFileCount - 未実行チャンクに含まれるファイル数
 * @returns 中断理由を含む警告文言
 */
export const buildAbortSkipMessage = <R>(chunkResults: R[], unexecutedFileCount: number): string => {
  const _reason = chunkResults.map((result) => describeAbortReason(result)).find((label) => label !== undefined);

  return `${_reason ?? _DEFAULT_ABORT_REASON}のため ${unexecutedFileCount} 件の`
    + 'チャンク未実行ファイルの実行を取りやめました（次回再判定対象）';
};
