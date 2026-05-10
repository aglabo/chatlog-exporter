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
import type { CommandProvider, EnvProvider } from '../../types/providers.types.ts';
// error class
import { ChatlogError } from '../../classes/ChatlogError.class.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/**
 * コマンドプロバイダのデフォルト実装。通常は Deno.Command を使用するが、テスト時にはモックに差し替えるため、定数として切り出している。
 */
const _DEFAULT_COMMAND_PROVIDER = Deno.Command as unknown as CommandProvider;

// ─────────────────────────────────────────────
// ホームディレクトリ
// ─────────────────────────────────────────────

/** ホームディレクトリを表す文字列を返す。 */
export const homeDir = (env: EnvProvider = Deno.env.get): string => {
  const _home = (env('HOME') ?? env('USERPROFILE')) ?? '~';
  return normalizePath(_home);
};

// ─────────────────────────────────────────────
// プロジェクトルート
// ─────────────────────────────────────────────

/**
 * `git rev-parse --show-toplevel` を実行してプロジェクトルートパスを返す。
 *
 * @param commandProvider - Deno.Command 互換のコマンドプロバイダ（テスト用インジェクション可能）
 * @returns プロジェクトルートの絶対パス（正規化済み）
 */
export const getProjectRootDir = async (
  commandProvider: CommandProvider = _DEFAULT_COMMAND_PROVIDER,
): Promise<string> => {
  const _cmd = new commandProvider('git', { args: ['rev-parse', '--show-toplevel'] });
  let _output: { success: boolean; code: number; stdout: Uint8Array };
  try {
    _output = await _cmd.output();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new ChatlogError('GitNotFound', 'git command not found');
    }
    throw e;
  }
  if (!_output.success) {
    throw new ChatlogError('NotInGitRepo', `git exited with code ${_output.code}`);
  }
  const _raw = new TextDecoder().decode(_output.stdout);
  return normalizePath(_raw.trim());
};
