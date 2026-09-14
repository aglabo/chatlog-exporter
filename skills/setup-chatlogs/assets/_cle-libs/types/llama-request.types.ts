// src: skills/_cle-libs/types/llama-request.types.ts
// @(#): llama (OpenAI 互換) chat completions リクエスト構築の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared libraries
// types
import type { OutputContract } from './json-schema.types.ts';

/** chat completions のメッセージロール（transport R-003）。system と user を別要素として扱う。 */
export type LlamaMessageRole = 'system' | 'user';

/** chat completions のメッセージ 1 件。 */
export type LlamaChatMessage = {
  role: LlamaMessageRole;
  content: string;
};

/**
 * llama リクエストボディ構築関数に渡す引数。
 *
 * 実際の送信は行わないため `fetchProvider` は含めない（構築と送信を分離する）。
 */
export type LlamaRequestParams = {
  /** `provider/model` 形式を含むモデル指定文字列（例: `'llama/qwen3-8b'`）。 */
  model: string;
  /** system ロールに載せるテキスト。 */
  system: string;
  /** user ロールに載せるテキスト。 */
  user: string;
  /** この呼び出しに適用する出力契約（structured-output §4.3.1）。 */
  outputContract?: OutputContract;
};

/**
 * llama chat completions へ送るリクエストボディ。
 *
 * 送るフィールドはこの 4 つに限り、`temperature` / `top_p` / `max_tokens` 等の
 * 生成パラメータは載せずサーバ既定に委ねる（transport R-009 / DR-15）。
 */
export type LlamaRequestBody = {
  /** provider prefix を除いたモデル識別子。 */
  model: string;
  /** system 先・user 後の 2 要素メッセージ配列。 */
  messages: LlamaChatMessage[];
  /** ストリーミング応答へ入る経路を塞ぐため常に明示する。 */
  stream: boolean;
  /** 出力契約から構築する構造化出力の指定。 */
  response_format: Record<string, unknown>;
};
