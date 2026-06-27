// src: skills/_scripts/libs/path-utils/path-utils.ts
// @(#): パスユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// utils
import { join, relative } from '@std/path';
import { getProjectRootDir } from './dir-utils.ts';
// types
import type { ResolveConfigPathOptions } from '../../types/path-utils.types.ts';
import type { CommandProvider } from '../../types/providers.types.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** Windowsパスの絶対パス正規表現 */
const _WIN_ABS = /^[A-Za-z]:\//;

/** コマンドプロバイダのデフォルト実装 */
const _DEFAULT_COMMAND_PROVIDER = Deno.Command as unknown as CommandProvider;

// ─────────────────────────────────────────────
// パス正規化
// ─────────────────────────────────────────────

/** パス区切り文字をスラッシュに統一し、URL pathname 形式（/C:/...）を修正し、末尾スラッシュを除去する。 */
export const normalizePath = (path: string): string => {
  return path.replaceAll('\\', '/').replace(/^\/([A-Za-z]:)/, '$1').replace(/(.)\/+$/, '$1');
};

/** ファイルパスからディレクトリ部分を返す（末尾スラッシュなし）。 */
export const getDirectory = (path: string): string => {
  return normalizePath(path).split('/').slice(0, -1).join('/');
};

/** ファイルパスからファイル名部分を返す。 */
export const getFilename = (path: string): string => {
  return normalizePath(path).split('/').pop() ?? '';
};

/** ファイルパスから拡張子を除いたファイル名（basename）を返す。ドットファイル（.hidden）は拡張子なしと見なす。 */
export const getBasename = (path: string): string => {
  const _filename = getFilename(path);
  const _dot = _filename.lastIndexOf('.');
  if (_dot <= 0) { return _filename; }
  return _filename.slice(0, _dot);
};

// ─────────────────────────────────────────────
// パス判定
// ─────────────────────────────────────────────

/** パスが絶対パスかどうかを返す。 */
export const isAbsolutePath = (path: string): boolean => {
  if (path === '') { return false; }
  const _normalized = normalizePath(path);
  if (_WIN_ABS.test(_normalized)) { return true; }
  if (_normalized.startsWith('/')) { return true; }
  return false;
};

// ─────────────────────────────────────────────
// パス結合・相対パス
// ─────────────────────────────────────────────

/** 複数のパスを結合し、区切り文字をスラッシュに統一して返す。 */
export const joinPath = (base: string, ...parts: string[]): string => {
  return normalizePath(join(base, ...parts));
};

/** `from` から `to` への相対パスを返す。区切り文字はスラッシュに統一される。 */
export const getRelativePath = (from: string, to: string): string => {
  return normalizePath(relative(from, to));
};

// ─────────────────────────────────────────────
// パス解決
// ─────────────────────────────────────────────

/**
 * configPath が絶対パスなら正規化して返す。
 * 相対パスなら getProjectRootDir() と結合して正規化して返す。
 * configPath が未指定のときは defaultPath を使用する。
 */
export const resolveConfigPath = async ({
  configPath,
  defaultPath,
  commandProvider = _DEFAULT_COMMAND_PROVIDER,
}: ResolveConfigPathOptions): Promise<string> => {
  const _path = configPath ?? defaultPath;
  let _resolved: string;
  if (isAbsolutePath(_path)) {
    _resolved = normalizePath(_path);
  } else {
    const _root = await getProjectRootDir(commandProvider);
    _resolved = normalizePath(`${_root}/${_path}`);
  }
  return _resolved;
};
