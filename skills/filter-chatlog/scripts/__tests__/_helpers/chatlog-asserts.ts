// src: scripts/__tests__/_helpers/chatlog-asserts.ts
// @(#): filter-chatlog E2E テスト用アサーション関数
//       ファイル存在・状態の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';

/**
 * 指定パスが通常ファイルとして存在することをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 */
export const assertFileExists = async (path: string): Promise<void> => {
  assertEquals((await Deno.stat(path)).isFile, true);
};

/**
 * 指定パスのファイルが存在するかどうかを返す。
 *
 * `Deno.stat` の成否でファイル存在を判定し、存在しない場合は `false` を返す。
 *
 * @param path - 確認するファイルの絶対パス
 * @returns ファイルが存在すれば `true`、存在しなければ `false`
 */
export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
};
