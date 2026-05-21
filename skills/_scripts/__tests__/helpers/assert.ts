// src: skills/_scripts/__tests__/helpers/assert.ts
// @(#): テスト共通アサーション関数
//       null チェック・真偽値・ファイル存在を一箇所に集約する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import {
  assert,
  assertEquals,
  assertFalse,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from '@std/assert';

// ─── Helpers
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import { dirExists, fileExists, fileOrDirExists } from '../../libs/file-ops/exists-utils.ts';
// types
import type { ErrorKind } from '../../types/chatlog-error.types.ts';

/**
 * 値が真であることをアサートする。
 *
 * @param actual - 検証する値
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertTrue = (actual: unknown, msg?: string): void => {
  assert(actual, msg);
};

/**
 * 値が `null` であることをアサートする。
 *
 * @param actual - 検証する値
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertNull = (actual: unknown, msg?: string): void => {
  assertEquals(actual, null, msg);
};

/**
 * 値が `null` でないことをアサートする。
 *
 * @param actual - 検証する値
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertNotNull = (actual: unknown, msg?: string): void => {
  assertNotEquals(actual, null, msg);
};

/**
 * 指定パスが通常ファイルとして存在することをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertFileExist = async (path: string, msg?: string): Promise<void> => {
  const _exists = await fileExists(path);
  assert(_exists, msg ?? `Expected file to exist: ${path}`);
};

/**
 * 指定パスがディレクトリとして存在することをアサートする。
 *
 * @param path - 確認するディレクトリの絶対パス
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertDirExist = async (path: string, msg?: string): Promise<void> => {
  const _exists = await dirExists(path);
  assert(_exists, msg ?? `Expected directory to exist: ${path}`);
};

/**
 * 指定パスに通常ファイルが存在しないことをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 * @param msg - 失敗時のメッセージ（省略可）
 */
export const assertFileNotExist = async (path: string, msg?: string): Promise<void> => {
  const _exists = await fileOrDirExists(path);
  assertFalse(_exists, msg ?? `Expected path to not exist: ${path}`);
};

/**
 * 関数が `ChatlogError` をスローし、`kind` および `subindex` が期待値と一致することをアサートする。
 *
 * @param fn - 検証対象の関数
 * @param expectedKind - 期待する `ErrorKind`
 * @param expectedSubindex - 期待する `subindex`（省略時はチェックしない）
 * @param msg - アサーション失敗時のメッセージ（省略可）
 * @returns キャッチした `ChatlogError` インスタンス
 */
export const assertThrowsChatlogError = (
  fn: () => unknown,
  expectedKind: ErrorKind,
  expectedSubindex?: string,
  msg?: string,
): ChatlogError => {
  const _err = assertThrows(fn, ChatlogError, undefined, msg);
  assertEquals(_err.kind, expectedKind, msg);
  if (expectedSubindex !== undefined) {
    assertEquals(_err.subindex, expectedSubindex, msg);
  }
  return _err;
};

/**
 * 非同期関数が `ChatlogError` を reject し、`kind` および `subindex` が期待値と一致することをアサートする。
 *
 * @param fn - 検証対象の非同期関数
 * @param expectedKind - 期待する `ErrorKind`
 * @param expectedSubindex - 期待する `subindex`（省略時はチェックしない）
 * @param msg - アサーション失敗時のメッセージ（省略可）
 * @returns キャッチした `ChatlogError` インスタンス
 */
export const assertRejectsChatlogError = async (
  fn: () => Promise<unknown>,
  expectedKind: ErrorKind,
  expectedSubindex?: string,
  msg?: string,
): Promise<ChatlogError> => {
  const _err = await assertRejects(fn, ChatlogError, undefined, msg);
  assertEquals(_err.kind, expectedKind, msg);
  if (expectedSubindex !== undefined) {
    assertEquals(_err.subindex, expectedSubindex, msg);
  }
  return _err;
};
