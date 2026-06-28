// src: skills/_scripts/libs/path-utils/path-env.ts
// @(#): パス文字列中の環境変数プレースホルダーを展開するユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external modules
import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import type { EnvProvider } from '../../types/providers.types.ts';
import { getProjectRoot } from './dir-utils.ts';
import { normalizePath } from './path-utils.ts';

// ─────────────────────────────────────────────
// ホームディレクトリ
// ─────────────────────────────────────────────

/** ホームディレクトリを表す文字列を返す。 */
export const homeDir = (env: EnvProvider = Deno.env.get): string => {
  const _home = (env('HOME') ?? env('USERPROFILE')) ?? '~';
  return normalizePath(_home);
};

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** `${VAR_NAME}` 形式のプレースホルダーにマッチする正規表現。 */
const _EXPAND_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** ProjectRoot 特殊キーワード（大文字小文字完全一致）。 */
const _KEYWORD_PROJECT_ROOT = 'ProjectRoot';

/** HOME 特殊キーワード。 */
const _KEYWORD_HOME = 'HOME';

/** allowList 省略時のデフォルト許可リスト。 */
const _DEFAULT_ALLOW_LIST: readonly string[] = ['TEMP', 'TMP'];

// ─────────────────────────────────────────────
// 変数名の解決
// ─────────────────────────────────────────────

/**
 * 1 つの変数名を解決して値の文字列を返す。
 *
 * @param name - プレースホルダー内の変数名（例: `'TEMP'`, `'ProjectRoot'`）
 * @param allowList - 展開を許可する変数名の一覧
 * @param envProvider - 環境変数取得関数
 * @returns 解決後の文字列
 * @throws {ChatlogError} EnvVarNotAllowed — allowList 外の変数
 * @throws {ChatlogError} EnvVarNotSet — allowList 内だが未定義の変数
 */
const _resolveEnv = async (
  name: string,
  allowList: readonly string[],
  envProvider: EnvProvider,
): Promise<string> => {
  switch (name) {
    case _KEYWORD_PROJECT_ROOT:
      return await getProjectRoot();
    case _KEYWORD_HOME:
      return homeDir(envProvider);
    default: {
      if (!allowList.includes(name)) {
        throw new ChatlogError('EnvVarNotAllowed', name, `${name} is not in allowList`);
      }
      const _value = envProvider(name);
      if (_value === undefined) {
        throw new ChatlogError('EnvVarNotSet', name, `${name} is not set`);
      }
      return _value;
    }
  }
};

// ─────────────────────────────────────────────
// パブリック API
// ─────────────────────────────────────────────

/**
 * パス文字列中の `${VAR_NAME}` 形式のプレースホルダーを展開して返す。
 *
 * - `${ProjectRoot}` はプロジェクトルートに展開（allowList 不要）。
 * - `${HOME}` はホームディレクトリに展開（allowList 不要）。
 * - TEMP / TMP のみ展開可能（固定 allowList）。
 * - 再展開はしない（単一パス処理）。
 *
 * @param input - 展開対象のパス文字列
 * @param env - 環境変数取得関数。省略時は Deno.env.get。
 * @returns 展開後のパス文字列
 * @throws {ChatlogError} EnvVarNotAllowed — allowList 外の変数が含まれる場合
 * @throws {ChatlogError} EnvVarNotSet — allowList 内の変数が未定義の場合
 */
export const expandEnvVars = async (
  input: string,
  env: EnvProvider = Deno.env.get,
): Promise<string> => {
  const _envProvider = env;
  const _allowList = _DEFAULT_ALLOW_LIST;
  const _matches = [...input.matchAll(_EXPAND_RE)];
  if (_matches.length === 0) {
    return input;
  }
  const _uniqueNames = [...new Set(_matches.map(([, name]) => name))];
  const _resolvedEntries = await Promise.all(
    _uniqueNames.map(async (name) => [name, await _resolveEnv(name, _allowList, _envProvider)] as const),
  );
  const _resolvedMap = new Map(_resolvedEntries);
  return input.replace(_EXPAND_RE, (_, name) => _resolvedMap.get(name)!);
};
