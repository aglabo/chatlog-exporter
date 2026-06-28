// src: skills/_scripts/libs/path-utils/resolve-path.ts
// @(#): パス解決ユーティリティ（設定ファイルパス・安全パス判定）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// utils
import { getProjectRoot } from './dir-utils.ts';
import { isAbsolutePath, normalizePath, toUnixPath } from './path-utils.ts';
// types
import type { ResolveConfigPathOptions } from '../../types/path-utils.types.ts';
import type { EnvProvider } from '../../types/providers.types.ts';

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
}: ResolveConfigPathOptions): Promise<string> => {
  const _path = configPath ?? defaultPath;
  let _resolved: string;
  if (isAbsolutePath(_path)) {
    _resolved = normalizePath(_path);
  } else {
    const _root = await getProjectRoot();
    _resolved = normalizePath(`${_root}/${_path}`);
  }
  return _resolved;
};

// ─────────────────────────────────────────────
// セーフパス解決
// ─────────────────────────────────────────────

/** パスが root 配下（セグメント境界）に含まれるか検証する内部ヘルパー。 */
const _isUnder = (path: string, root: string): boolean => path === root || path.startsWith(root + '/');

/**
 * パスが安全なディレクトリ配下にあるかどうかを返す。
 * 安全なディレクトリは projectRoot・TEMP・TMP・opts.safeDirs の組み合わせ。
 * 許可外のパスは throw せず false を返す。
 */
export const isSafePath = async (
  path: string,
  opts?: { safeDirs?: string[]; envProvider?: EnvProvider },
): Promise<boolean> => {
  // Step 1: backslash → slash + normalize dots
  let _resolved = toUnixPath(path);

  // Step 2: absolutize relative paths using projectRoot
  if (!(_resolved.startsWith('/') || /^[A-Za-z]:\//.test(_resolved))) {
    const _root = await getProjectRoot();
    _resolved = toUnixPath(`${_root}/${_resolved}`);
  }

  // Step 3: build safe directory list
  const _projectRoot = await getProjectRoot();
  const _envProvider = opts?.envProvider ?? Deno.env.get;
  const _temp = _envProvider('TEMP');
  const _tmp = _envProvider('TMP');

  const _safeDirs: string[] = [
    _projectRoot,
    ...(_temp !== undefined ? [toUnixPath(_temp)] : []),
    ...(_tmp !== undefined ? [toUnixPath(_tmp)] : []),
    ...(opts?.safeDirs?.map(toUnixPath) ?? []),
  ];

  // Step 4: check containment
  return _safeDirs.some((dir) => _isUnder(_resolved, dir));
};
