// src: skills/_cle-libs/types/llama-response.types.ts
// @(#): llama (OpenAI 互換) chat completions レスポンス解釈の型定義
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * chat completions 応答の `choices[].message`。
 *
 * 解釈関数はサーバが契約を守らない前提で読むため、フィールドは optional とする。
 */
export type LlamaResponseMessage = {
  /**
   * アシスタントが返したテキスト。
   *
   * サーバは `null` や配列（`tool_calls` 中心の応答等）を返すことがあるため
   * `unknown` とし、文字列であることの検査は解釈側で行う（error-handling R-004 条件 b/c）。
   */
  content?: unknown;
};

/**
 * chat completions 応答の `choices[]` 要素。
 *
 * 採用するのは `choices[0]` のみで、2 番目以降は無視する（transport R-007 / AC-017）。
 */
export type LlamaResponseChoice = {
  /** アシスタントメッセージ。 */
  message?: LlamaResponseMessage;
  /**
   * 生成の終了理由（正常終了は `'stop'`）。
   *
   * サーバは欠落や `null` を返すことがあるため `null` も許容する。
   * いずれも「`stop` 以外」として扱う（error-handling R-004 条件 d / DR-26 決定 3）。
   */
  finish_reason?: string | null;
};

/**
 * chat completions 応答ボディの on-wire 形状。
 *
 * サーバの応答が契約どおりである保証は無いため、すべて optional で定義する。
 */
export type LlamaResponseBody = {
  /**
   * 生成結果の候補配列。
   *
   * サーバは要素に `null` を載せることがあるため、要素も nullable とする。
   * `choices[0]` が `null` の場合は「選択そのものが成立しない」として扱う
   * （error-handling §4.1 R-004 条件 a）。
   */
  choices?: (LlamaResponseChoice | null)[];
};
