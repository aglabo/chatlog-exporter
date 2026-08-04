// src: skills/_cle-libs/libs/ai/rate-limit-utils.ts
// @(#): AI レートリミットエラー判定ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// functions
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

/**
 * 与えられた値が AI レートリミット由来の `ChatlogError` かどうかを判定する。
 *
 * @param e - 判定対象の値（catch 節で受け取る `unknown` を想定）
 * @returns `kind==='AiError'` かつ `subindex==='RateLimit'` の `ChatlogError` なら `true`、それ以外は `false`
 */
export const isRateLimitError = (e: unknown): boolean =>
  e instanceof ChatlogError && e.kind === 'AiError' && e.subindex === 'RateLimit';

/**
 * 与えられた値が AI CLI の非0終了由来の致命的 `ChatlogError` かどうかを判定する。
 *
 * rate limit / exit failure など subindex を問わず `kind==='AiError'` を致命とみなす。
 * リトライ・フォールバックせず即 abort すべきエラーの判定に用いる。
 *
 * @param e - 判定対象の値（catch 節で受け取る `unknown` を想定）
 * @returns `kind==='AiError'` の `ChatlogError` なら `true`、それ以外は `false`
 */
export const isFatalAiError = (e: unknown): boolean => e instanceof ChatlogError && e.kind === 'AiError';
