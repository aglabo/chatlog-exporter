// src: skills/_scripts/libs/file-io/exists-utils.ts
// @(#): ファイル・ディレクトリ存在チェックユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { StatProvider } from '../../types/providers.types.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** ファイル情報取得プロバイダのデフォルト実装 */
const _DEFAULT_STAT_PROVIDER: StatProvider = (path: string) => Deno.stat(path);

// ─────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────

// NotFound のみ null に縮約し、それ以外は再スロー
const _getFileStat = async (
  path: string,
  statProvider: StatProvider,
): Promise<Deno.FileInfo | null> => {
  try {
    return await statProvider(path);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) { throw e; }
    return null;
  }
};

// ─────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────

/**
 * 指定パスが通常ファイルとして存在するかどうかを返す。
 *
 * `stat.isFile === true` の場合のみ `true` を返す。ディレクトリは `false`。
 * `Deno.errors.NotFound` のみ `false` として扱い、それ以外のエラー（権限不足など）は再スローする。
 *
 * @param path - 確認するファイルの絶対パス
 * @param statProvider - テスト用注入可能な stat 関数（デフォルト: `Deno.stat`）
 * @returns 通常ファイルとして存在すれば `true`、ディレクトリや不在なら `false`
 * @throws パーミッションエラーなど `NotFound` 以外のエラー
 */
export const fileExists = async (
  path: string,
  statProvider: StatProvider = _DEFAULT_STAT_PROVIDER,
): Promise<boolean> => {
  const _stat = await _getFileStat(path, statProvider);
  return _stat !== null && _stat.isFile;
};

/**
 * 指定パスがディレクトリとして存在するかどうかを返す。
 *
 * `Deno.errors.NotFound` のみ `false` として扱い、それ以外のエラー（権限不足など）は再スローする。
 *
 * @param path - 確認するディレクトリの絶対パス
 * @param statProvider - テスト用注入可能な stat 関数（デフォルト: `Deno.stat`）
 * @returns ディレクトリとして存在すれば `true`、存在しないかファイルなら `false`
 * @throws パーミッションエラーなど `NotFound` 以外のエラー
 */
export const dirExists = async (
  path: string,
  statProvider: StatProvider = _DEFAULT_STAT_PROVIDER,
): Promise<boolean> => {
  const _stat = await _getFileStat(path, statProvider);
  return _stat !== null && _stat.isDirectory;
};

/**
 * 指定パスがファイルまたはディレクトリとして存在するかどうかを返す。
 *
 * `stat` が成功すれば `true` を返す（ファイル・ディレクトリを区別しない）。
 * `Deno.errors.NotFound` のみ `false` として扱い、それ以外のエラーは再スローする。
 *
 * @param path - 確認するパスの絶対パス
 * @param statProvider - テスト用注入可能な stat 関数（デフォルト: `Deno.stat`）
 * @returns 存在すれば `true`、存在しなければ `false`
 * @throws パーミッションエラーなど `NotFound` 以外のエラー
 */
export const fileOrDirExists = async (
  path: string,
  statProvider: StatProvider = _DEFAULT_STAT_PROVIDER,
): Promise<boolean> => {
  const _stat = await _getFileStat(path, statProvider);
  return _stat !== null;
};
