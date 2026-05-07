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

// ─── Helpers
import { fileExists as _fileExists, fileOrDirExists } from '../../../../_scripts/libs/file-io/exists-utils.ts';

/**
 * 指定パスが通常ファイルとして存在することをアサートする。
 *
 * @param path - 確認するファイルの絶対パス
 */
export const assertFileExists = async (path: string): Promise<void> => {
  assertEquals(await _fileExists(path), true);
};

/**
 * 指定パスのファイルが存在するかどうかを返す。
 *
 * `fileOrDirExists` への alias。ファイル・ディレクトリを区別しない。
 *
 * @param path - 確認するファイルの絶対パス
 * @returns ファイルが存在すれば `true`、存在しなければ `false`
 */
export const fileExists = fileOrDirExists;
