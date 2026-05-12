// src: scripts/__tests__/_helpers/asserts.ts
// @(#): filter-chatlogs E2E テスト用アサーション関数
//       ファイル存在・状態の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertFalse } from '@std/assert';

// ─── Helpers
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';

/**
 * 指定パスが通常ファイルとして存在することをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 */
export const assertFileExists = async (path: string): Promise<void> => {
  assert(await fileExists(path));
};

/**
 * 指定パスに通常ファイルが存在しないことをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 */
export const assertFileNotExists = async (path: string): Promise<void> => {
  assertFalse(await fileExists(path));
};
