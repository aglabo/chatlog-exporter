// src: skills/_cle-libs/libs/ai/abort-utils.ts
// @(#): AI 一括処理の中断判定ユーティリティ（中断側 / 続行側の subindex を単独所有する）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// functions
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

/**
 * llama 経路で一括処理を中断すべき subindex と、ユーザーに提示する中断理由のラベル。
 *
 * DR-18 決定 2 の中断側 subindex 一覧をこのファイルが単独所有する（DR-16 決定 1）。
 * 判定と表示で一覧が二重化しないよう、`_ABORT_SUBINDEXES` はこの表から導出する。
 */
const _ABORT_REASON_LABELS: Readonly<Record<string, string>> = {
  RateLimit: 'レートリミット',
  InvalidEndpoint: 'エンドポイント設定の不備',
  BackendUnavailable: 'AI バックエンドへの接続失敗',
  ResponseFormatRejected: 'レスポンス形式の拒否',
};

/** llama 経路で一括処理を中断すべき subindex。 */
const _ABORT_SUBINDEXES: readonly string[] = Object.keys(_ABORT_REASON_LABELS);

/**
 * 応答が出力契約に適合しなかったことを表す subindex（続行側）。
 *
 * 中断側一覧（`_ABORT_REASON_LABELS`）をこのファイルが単独所有するのと対になる形で、
 * 続行側の subindex もここが単独所有する。呼び出し元が `'ResponseSchemaViolation'` を
 * 文字列リテラルで直書きすると、中断側と続行側の線引きが実装ファイルへ散り、
 * 片方だけ変わっても型検査に掛からなくなる。
 */
export const RESPONSE_FORMAT_VIOLATION_SUBINDEX = 'ResponseSchemaViolation';

/**
 * 与えられた値が llama 経路で一括処理を中断すべき `ChatlogError` かどうかを判定する。
 *
 * @param e - 判定対象の値（catch 節で受け取る `unknown` を想定）
 * @returns `kind==='AiError'` かつ `subindex` が `_ABORT_SUBINDEXES` に含まれる `ChatlogError` なら `true`、それ以外は `false`
 */
export const isAbortingAiError = (e: unknown): boolean =>
  e instanceof ChatlogError && e.kind === 'AiError' && _ABORT_SUBINDEXES.includes(e.subindex);

/**
 * 与えられた値が「応答が出力契約に適合しない」ことを表す `ChatlogError` かどうかを判定する。
 *
 * llama 経路（`run-ai.ts` の `_runViaHttp`）は応答を受け取ったあとに自分で
 * `parseContractPayload` / `validateOutputContract` を呼び、不適合を
 * `ChatlogError('AiError', 'ResponseSchemaViolation', ...)` として throw する。
 * `kind` が `AiError` なので見た目は中断側と同じだが、扱いは逆である。
 *
 * 中断側（レートリミット・エンドポイント設定の不備・接続失敗・レスポンス形式の拒否）は
 * 同じ要求を送り直しても結果が変わらないため即座に打ち切る。対して応答形式違反は、
 * 要求が受理されたうえで応答の形だけが揺らいだ失敗であり、**同じ要求を送り直せば直り得る**。
 * そのため `_ABORT_SUBINDEXES` には入れず、再要求の可否を問う専用の述語として切り出す。
 *
 * @param e - 判定対象の値（catch 節で受け取る `unknown` を想定）
 * @returns `kind==='AiError'` かつ `subindex` が `RESPONSE_FORMAT_VIOLATION_SUBINDEX` の `ChatlogError` なら `true`、それ以外は `false`
 */
export const isResponseFormatViolation = (e: unknown): boolean =>
  e instanceof ChatlogError && e.kind === 'AiError' && e.subindex === RESPONSE_FORMAT_VIOLATION_SUBINDEX;

/**
 * 中断側 `ChatlogError` から、ユーザーに提示する中断理由のラベルを返す。
 *
 * 中断理由は `ChatlogError.subindex` が保持しているため、呼び出し元は捕捉した例外を
 * そのまま渡せばよい。中断側でない値には `undefined` を返すので、呼び出し元は
 * バックエンド中立な既定文言へフォールバックできる。
 *
 * `instanceof` の再判定は `isAbortingAiError` と重複するが、`e.subindex` を参照するための
 * 型ナローイングに必要なため残している。
 *
 * @param e - 判定対象の値（catch 節や `runChunked` の戻り値で受け取る `unknown` を想定）
 * @returns 中断側の `ChatlogError` なら理由ラベル、それ以外は `undefined`
 */
export const describeAbortReason = (e: unknown): string | undefined =>
  e instanceof ChatlogError && isAbortingAiError(e) ? _ABORT_REASON_LABELS[e.subindex] : undefined;
