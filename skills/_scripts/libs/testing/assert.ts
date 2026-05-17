// src: skills/_scripts/libs/testing/assert.ts
// @(#): null チェック用共通アサーション関数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertNotEquals } from '@std/assert';

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
