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
// constants
import { DEFAULT_CONFIG_DIR } from '../../constants/defaults.constants.ts';
// types
import type { ResolveConfigPathOptions } from '../../types/path-utils.types.ts';
import type { EnvProvider } from '../../types/providers.types.ts';
// classes
import { GlobalConfig } from '../../classes/GlobalConfig.class.ts';

// ─────────────────────────────────────────────
// パス解決
// ─────────────────────────────────────────────

/**
 * configPath が絶対パスなら正規化して返す。
 * 相対パスなら baseDir と結合して正規化して返す。
 * configPath が未指定のときは defaultPath を使用する。
 */
export const resolveConfigPath = ({
  configPath,
  defaultPath,
  config,
}: ResolveConfigPathOptions): string => {
  const _path = configPath ?? defaultPath;
  if (isAbsolutePath(_path)) {
    return normalizePath(_path);
  }
  const _globalConfig = config ?? GlobalConfig.getInstance();
  const baseDir = _globalConfig.configDir ?? DEFAULT_CONFIG_DIR;
  return normalizePath(`${baseDir}/${_path}`);
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
export const isSafePath = (
  path: string,
  opts?: { safeDirs?: string[]; envProvider?: EnvProvider },
): boolean => {
  // Step 1: backslash → slash + normalize dots
  let _resolved = toUnixPath(path);

  // Step 2: absolutize relative paths using projectRoot
  if (!(_resolved.startsWith('/') || /^[A-Za-z]:\//.test(_resolved))) {
    const _root = getProjectRoot();
    _resolved = toUnixPath(`${_root}/${_resolved}`);
  }

  // Step 3: build safe directory list
  const _projectRoot = getProjectRoot();
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
