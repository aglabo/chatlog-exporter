// src: skills/_scripts/libs/path-utils/dir-utils.ts
// @(#): ディレクトリ取得ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- external modules
import { normalizePath } from './path-utils.ts';

// ─────────────────────────────────────────────
// getProjectRoot / resetProjectRoot
// ─────────────────────────────────────────────

/** 実行時のカレントディレクトリをプロジェクトルートとして返す。 */
const _fetchProjectRoot = (): string => normalizePath(Deno.cwd());

/** モジュールレベルのキャッシュ。プロジェクトルートの文字列を保持する。 */
let _cachedRoot: string | null = null;

/**
 * プロジェクトルートの絶対パスを返す。
 *
 * 初回呼び出し時に `Deno.cwd()` を正規化して取得し、以降はモジュールレベルにキャッシュした値を返す。
 * そのため値はプロセス中の最初の呼び出し時点のカレントディレクトリに固定される。
 * 値を差し替えるには `resetProjectRoot()` を使う。
 *
 * @returns プロジェクトルートの絶対パス（正規化済み）
 * @see resetProjectRoot
 */
export const getProjectRoot = (): string => (_cachedRoot ??= _fetchProjectRoot());

/**
 * キャッシュをリセットする。initialRoot を指定すると次回の getProjectRoot() がそれを返す（テスト用シード）。
 *
 * @param initialRoot - シードするパス。空文字列または省略でキャッシュをクリアする
 */
export const resetProjectRoot = (initialRoot: string = ''): void => {
  _cachedRoot = initialRoot === '' ? null : normalizePath(initialRoot);
};
