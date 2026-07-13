// src: skills/_scripts/libs/parallel/concurrency.ts
// @(#): 並列処理共通ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import type { Task } from '../../types/common.types.ts';

export type { Task } from '../../types/common.types.ts';

// ─────────────────────────────────────────────
// 並列実行（低レベル）
// ─────────────────────────────────────────────

/**
 * 非同期タスク配列を並列度 `limit` で実行し、入力順の結果配列を返す。
 */
export const withConcurrency = async <T>(
  tasks: Task<T>[],
  limit: number,
): Promise<T[]> => {
  const results: T[] = new Array(tasks.length);
  const ctl = new AbortController();
  let idx = 0;
  const _worker = async (): Promise<void> => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i](ctl);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, _worker));
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
 * `items` の各要素に `fn` を並列度 `limit` で適用し、入力順の結果配列を返す。
 */
export const runConcurrent = <T, R>(
  items: T[],
  fn: (item: T, ctl: AbortController) => Promise<R>,
  limit: number,
): Promise<R[]> => {
  return withConcurrency(createTasks(items, fn), limit);
};

/**
 * `items` を `chunkSize` 単位に分割し、各 chunk に `fn` を並列度 `limit` で適用する。
 */
export const runChunked = <T, R>(
  items: T[],
  chunkSize: number,
  fn: (chunk: T[], ctl: AbortController) => Promise<R>,
  limit: number,
): Promise<R[]> => {
  return withConcurrency(createChunkedTasks(items, chunkSize, fn), limit);
};
