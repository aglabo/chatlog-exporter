// src: skills/_cle-libs/libs/file-ops/find-files.ts
// @(#): ファイル一覧取得共通ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { expandGlob } from '@std/fs';

import type { GlobProvider } from '../../types/providers.types.ts';
import { normalizePath } from '../path-utils/path-utils.ts';
import { findDirectoriesFlat } from './find-entries.ts';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** {@link findFiles} のオプション引数。 */
export interface FindFilesOptions {
  /** 検索対象ファイルの拡張子（デフォルト `".md"`）。必ずドット始まりで指定する。 */
  ext?: string;
  /** glob パターンでパス一覧を返す関数。未指定時は `expandGlob` を使用。 */
  glob?: GlobProvider;
}

// ─────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────

const _defaultGlob: GlobProvider = async (pattern: string): Promise<string[]> => {
  const _results: string[] = [];
  for await (const entry of expandGlob(pattern)) {
    _results.push(normalizePath(entry.path));
  }
  return _results;
};

/** `dir` 直下の `ext` ファイルパス一覧を返す（内部実装）。 */
const _findFileFlats = async (dir: string, ext: string, glob: GlobProvider): Promise<string[]> => {
  return await glob(`${dir}/*${ext}`);
};

/**
 * `dir` 直下の `ext` ファイルパス一覧を返す（1段のみ、サブディレクトリ非再帰）。
 *
 * @param dir - 探索対象ディレクトリパス
 * @param options - `ext`（デフォルト `".md"`）、`glob` プロバイダー
 * @throws Error `ext` がドット始まりでない場合
 */
export const findFilesFlat = async (
  dir: string,
  options?: FindFilesOptions,
): Promise<string[]> => {
  const _ext = options?.ext ?? '.md';
  if (!_ext.startsWith('.')) {
    throw new Error(`ext must start with '.': "${_ext}"`);
  }
  const _glob = options?.glob ?? _defaultGlob;
  return await _findFileFlats(dir, _ext, _glob);
};

/**
 * ディレクトリ `dir` 配下の `ext` ファイルパスを再帰的に収集し、辞書順ソートして返す。
 * 存在しないディレクトリを渡した場合は空配列を返す（例外なし）。
 *
 * @param dir - 走査対象のディレクトリパス
 * @param options - オプション（`ext` で拡張子を指定、`glob` でテスト用モックを注入可能）
 * @returns 辞書順ソート済みのファイルパス配列
 * @throws Error `ext` がドット始まりでない場合
 */
export const findFiles = async (
  dir: string,
  options?: FindFilesOptions,
): Promise<string[]> => {
  const _ext = options?.ext ?? '.md';
  if (!_ext.startsWith('.')) {
    throw new Error(`ext must start with '.': "${_ext}"`);
  }
  const _glob = options?.glob ?? _defaultGlob;
  const _all: string[] = [];
  const _queue = [dir];
  while (_queue.length > 0) {
    const current = _queue.shift()!;
    const [files, dirs] = await Promise.all([
      _findFileFlats(current, _ext, _glob),
      findDirectoriesFlat(current, { glob: _glob }),
    ]);
    _all.push(...files);
    _queue.push(...dirs);
  }
  return _all.sort();
};
