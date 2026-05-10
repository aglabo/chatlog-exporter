// src: skills/_scripts/libs/file-ops/find-entries.ts
// @(#): ディレクトリ一覧・ファイルエントリ収集ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- external --
import { expandGlob } from '@std/fs';

// -- internal --
import type { GlobProvider } from '../../types/providers.types.ts';
import { normalizePath } from '../file-io/path-utils.ts';

// ─────────────────────────────────────────────
// Internal utilities
// ─────────────────────────────────────────────

const _defaultGlob: GlobProvider = (pattern: string): Promise<string[]> =>
  Array.fromAsync(expandGlob(pattern), (entry) => normalizePath(entry.path));

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

/** findEntries のオプション */
export interface FindEntriesOptions {
  include?: string[];
  exclude?: string[];
  glob?: GlobProvider;
}

// ─────────────────────────────────────────────
// Public functions
// ─────────────────────────────────────────────

/**
 * 指定ディレクトリ直下のサブディレクトリパス一覧をソートして返す。
 * ディレクトリ不存在・権限エラー時は空配列を返す（例外なし）。
 */
export async function findDirectories(dir: string): Promise<string[]> {
  try {
    const _entries = await Array.fromAsync(Deno.readDir(dir));
    return _entries
      .filter((e) => e.isDirectory)
      .map((e) => `${dir}/${e.name}`)
      .sort();
  } catch {
    return [];
  }
}

/**
 * ディレクトリパスの配列を対象に、指定拡張子のファイルを glob で一括収集する。
 * exclude に文字列を指定すると、パスにその文字列を含むエントリを除外する。
 * ソートして返す。dirs が空配列なら空配列を返す。
 */
export async function findEntries(
  dirs: string[],
  ext: string,
  options?: FindEntriesOptions,
): Promise<string[]> {
  if (dirs.length === 0) { return []; }

  const _glob = options?.glob ?? _defaultGlob;
  const _include = options?.include ?? [];
  const _exclude = options?.exclude ?? [];

  const _entryGroups = await Promise.all(
    dirs.map((dir) => _glob(`${dir}/**/*${ext}`)),
  );

  return _entryGroups
    .flatMap((entries) =>
      entries.filter((entry) =>
        _include.every((inc) => entry.includes(inc))
        && _exclude.every((ex) => !entry.includes(ex))
      )
    )
    .sort();
}
