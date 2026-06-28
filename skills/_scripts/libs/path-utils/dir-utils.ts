// src: skills/_scripts/libs/path-utils/dir-utils.ts
// @(#): ディレクトリ取得ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- external modules
import { normalizePath } from './path-utils.ts';
// types
import type { EnvProvider } from '../../types/providers.types.ts';
// error class
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// ホームディレクトリ
// ─────────────────────────────────────────────

/** ホームディレクトリを表す文字列を返す。 */
export const homeDir = (env: EnvProvider = Deno.env.get): string => {
  const _home = (env('HOME') ?? env('USERPROFILE')) ?? '~';
  return normalizePath(_home);
};

// ─────────────────────────────────────────────
// getProjectRoot / resetProjectRoot
// ─────────────────────────────────────────────

/** git rev-parse --show-toplevel を実行してプロジェクトルートパスを返す。 */
const _fetchProjectRoot = async (): Promise<string> => {
  const _cmd = new Deno.Command('git', { args: ['rev-parse', '--show-toplevel'] });
  let _output: { success: boolean; code: number; stdout: Uint8Array };
  try {
    _output = await _cmd.output();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new ChatlogError('GitNotFound', 'NotFound', 'git command not found');
    }
    throw e;
  }
  if (!_output.success) {
    throw new ChatlogError('NotInGitRepo', 'ExitFailure', `git exited with code ${_output.code}`);
  }
  const _raw = new TextDecoder().decode(_output.stdout);
  return normalizePath(_raw.trim());
};

/** モジュールレベルのキャッシュ。プロジェクトルートの Promise を保持する。 */
let _cachedRoot: Promise<string> | null = null;

/**
 * プロジェクトルートの絶対パスを返す。初回は git を実行し、以降はキャッシュを返す。
 *
 * @returns プロジェクトルートの絶対パス（正規化済み）
 */
export const getProjectRoot = (): Promise<string> => (_cachedRoot ??= _fetchProjectRoot());

/**
 * キャッシュをリセットする。initialRoot を指定すると次回の getProjectRoot() がそれを返す（テスト用シード）。
 *
 * @param initialRoot - シードするパス。空文字列または省略でキャッシュをクリアする
 */
export const resetProjectRoot = (initialRoot: string = ''): void => {
  _cachedRoot = initialRoot === '' ? null : Promise.resolve(normalizePath(initialRoot));
};
