// src: skills/_scripts/libs/file-io/path-utils.ts
// @(#): パスユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// utils
import { getProjectRootDir } from './dir-utils.ts';
import { fileOrDirExists } from './exists-utils.ts';
// types
import type { ResolveConfigPathOptions } from '../../types/file-io.types.ts';
import type { CommandProvider } from '../../types/providers.types.ts';
// error class
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

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

/** パス区切り文字をスラッシュに統一し、URL pathname 形式（/C:/...）を修正する。 */
export const normalizePath = (path: string): string => {
  return path.replaceAll('\\', '/').replace(/^\/([A-Za-z]:)/, '$1');
};

/** ファイルパスからディレクトリ部分を返す（末尾スラッシュなし）。 */
export const getDirectory = (path: string): string => {
  return normalizePath(path).split('/').slice(0, -1).join('/');
};

/** ファイルパスからファイル名部分を返す。 */
export const getFileName = (path: string): string => {
  return normalizePath(path).split('/').pop() ?? '';
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
// パス解決
// ─────────────────────────────────────────────

/**
 * configPath が絶対パスなら正規化して返す。
 * 相対パスなら getProjectRootDir() と結合して正規化して返す。
 * configPath が未指定のときは defaultPath を使用する。
 * 解決したパスが存在しない場合は ChatlogError(InputNotFound) をスローする。
 */
export const resolveConfigPath = async ({
  configPath,
  defaultPath,
  commandProvider = _DEFAULT_COMMAND_PROVIDER,
  statProvider,
}: ResolveConfigPathOptions): Promise<string> => {
  const _path = configPath ?? defaultPath;
  let _resolved: string;
  if (isAbsolutePath(_path)) {
    _resolved = normalizePath(_path);
  } else {
    const _root = await getProjectRootDir(commandProvider);
    _resolved = normalizePath(`${_root}/${_path}`);
  }

  try {
    const _exists = await fileOrDirExists(_resolved, statProvider);
    if (!_exists) {
      throw new ChatlogError('FileDirNotFound', `設定ファイル/ディレクトリが見つかりません: ${_resolved}`);
    }
  } catch (e) {
    if (e instanceof ChatlogError) { throw e; }
    throw new ChatlogError('FileDirNotFound', `設定ファイル/ディレクトリが見つかりません: ${_resolved}`);
  }

  return _resolved;
};
