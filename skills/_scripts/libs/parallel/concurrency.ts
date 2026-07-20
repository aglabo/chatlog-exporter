// src: skills/_scripts/libs/parallel/concurrency.ts
// @(#): 並列処理共通ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import type { Task } from '../../types/common.types.ts';

export type { Task } from '../../types/common.types.ts';

// ─────────────────────────────────────────────
// 並列実行（低レベル）
// ─────────────────────────────────────────────

/**
 * 非同期タスク配列を並列度 `limit` で実行し、入力順の結果配列を返す。
 *
 * `ctl.abort()` が呼ばれた後は未着手タスクを実行せず、結果配列の該当インデックスは
 * 穴（未代入）のまま残る。いずれかのタスクが reject した場合は直ちに `ctl.abort()` を呼び、
 * 全ワーカーの未着手タスク着手を止める。ただし、実行中の他ワーカーが副作用を伴う処理を
 * 継続している可能性があるため、呼び出し元へエラーを返す前に全ワーカーの終了を待ち、
 * その後で最初に発生したエラーを呼び出し元に伝播する。
 */
export const withConcurrency = async <T>(
  tasks: Task<T>[],
  limit: number,
): Promise<T[]> => {
  const results: T[] = new Array(tasks.length);
  const ctl = new AbortController();
  let idx = 0;
  let _errored = false;
  let _firstError: unknown;
  const _worker = async (): Promise<void> => {
    while (idx < tasks.length && !ctl.signal.aborted) {
      const i = idx++;
      try {
        results[i] = await tasks[i](ctl);
      } catch (e) {
        if (!_errored) {
          _errored = true;
          _firstError = e;
        }
        ctl.abort();
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(limit, tasks.length) }, _worker));
  if (_errored) {
    throw _firstError;
  }
  return results;
};

// ─────────────────────────────────────────────
// タスク生成（低レベル）
// ─────────────────────────────────────────────

/**
 * `items` の各要素に `fn` を適用する `Task` 配列を生成する。
 */
export const createTasks = <T, R>(
  items: T[],
  fn: (item: T, ctl: AbortController) => Promise<R>,
): Task<R>[] => {
  return items.map((item) => (ctl) => fn(item, ctl));
};

/**
 * `items` を `chunkSize` 単位に分割し、各 chunk に `fn` を適用する `Task` 配列を生成する。
 */
export const createChunkedTasks = <T, R>(
  items: T[],
  chunkSize: number,
  fn: (chunk: T[], ctl: AbortController) => Promise<R>,
): Task<R>[] => {
  return Array.from(
    { length: Math.ceil(items.length / chunkSize) },
    (_, i) => (ctl) => fn(items.slice(i * chunkSize, (i + 1) * chunkSize), ctl),
  );
};

// ─────────────────────────────────────────────
// 高レベル並列実行
// ─────────────────────────────────────────────

/**
 * `withConcurrency` で発生した例外を `ChatlogError('ParallelExecutionError', ...)` にラップする。
 *
 * 元の例外が既に `ChatlogError` の場合は、呼び出し元の既存 `kind` 分岐を壊さないよう
 * ラップせずそのまま返す。それ以外の場合は `Error.name`（不明な場合は `'UnknownError'`）を
 * `subindex` として `ChatlogError('ParallelExecutionError', ...)` にラップする。
 */
const _wrapParallelError = (e: unknown): Error => {
  if (e instanceof ChatlogError) {
    return e;
  }
  const _subindex = e instanceof Error ? e.name : 'UnknownError';
  const _detail = e instanceof Error ? e.message : String(e);
  return new ChatlogError('ParallelExecutionError', _subindex, _detail);
};

/**
 * `items` の各要素に `fn` を並列度 `limit` で適用し、入力順の結果配列を返す。
 */
export const runConcurrent = async <T, R>(
  items: T[],
  fn: (item: T, ctl: AbortController) => Promise<R>,
  limit: number,
): Promise<R[]> => {
  try {
    return await withConcurrency(createTasks(items, fn), limit);
  } catch (e) {
    throw _wrapParallelError(e);
  }
};

/**
 * `items` を `chunkSize` 単位に分割し、各 chunk に `fn` を並列度 `limit` で適用する。
 */
export const runChunked = async <T, R>(
  items: T[],
  chunkSize: number,
  fn: (chunk: T[], ctl: AbortController) => Promise<R>,
  limit: number,
): Promise<R[]> => {
  try {
    return await withConcurrency(createChunkedTasks(items, chunkSize, fn), limit);
  } catch (e) {
    throw _wrapParallelError(e);
  }
};
