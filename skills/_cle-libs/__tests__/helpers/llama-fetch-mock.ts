// src: skills/_cle-libs/__tests__/helpers/llama-fetch-mock.ts
// @(#): llama 経路（HTTP）テスト用の fetch spy / 応答ヘルパー
//       実ネットワークへ接続せず、runAI の fetchProvider に注入して送信内容を記録する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import type { FetchProvider } from '../../types/providers.types.ts';

/** fetch spy が記録する 1 回分の呼び出し。 */
export type FetchCall = { input: string | URL | Request; init?: RequestInit };

/** makeFetchSpy() が返すハンドル。`provider` を注入し、`calls` で送信内容を参照する。 */
export type FetchSpy = { provider: FetchProvider; calls: FetchCall[] };

/**
 * 呼び出しを記録し、固定応答を返す `FetchProvider` spy を生成する。
 *
 * @param respond - 呼び出しごとに返す `Response` を生成する関数
 * @returns 注入用の provider と記録された呼び出し一覧
 */
export const makeFetchSpy = (respond: () => Response): FetchSpy => {
  const _calls: FetchCall[] = [];
  const _provider: FetchProvider = (input, init) => {
    _calls.push({ input, init });
    return Promise.resolve(respond());
  };
  return { provider: _provider, calls: _calls };
};

/**
 * llama の 2xx 応答（`choices[0].message.content` + `finish_reason: 'stop'`）を生成する。
 *
 * @param content - `choices[0].message.content` に入れる文字列
 * @returns Content-Type が application/json の `Response`
 */
export const makeLlamaOkResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
