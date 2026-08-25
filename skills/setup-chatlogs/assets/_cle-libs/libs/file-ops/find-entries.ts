// src: skills/_cle-libs/libs/file-ops/find-entries.ts
// @(#): ディレクトリ一覧・ファイルエントリ収集ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- external --
import { expandGlob } from 'jsr:@std/fs@^1.0.23';

// -- internal --
import type { DirProvider, GlobProvider } from '../../types/providers.types.ts';
import { normalizePath } from '../path-utils/path-utils.ts';

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

/** findDirectoriesFlat のオプション */
export interface FindDirectoriesFlatOptions {
  glob?: GlobProvider;
}

/** findDirectories のオプション */
export interface FindDirectoriesOptions {
  glob?: GlobProvider;
}

// ─────────────────────────────────────────────
// Public functions
// ─────────────────────────────────────────────

/**
 * 指定ディレクトリ直下のサブディレクトリパス一覧をソートして返す。
 * ディレクトリが存在しない場合は空配列を返す。権限エラー等は再スローする。
 */
export const findDirectoriesFlat = async (
  dir: string,
  options?: FindDirectoriesFlatOptions,
): Promise<string[]> => {
  const _glob = options?.glob ?? _defaultGlob;
  try {
    const _dirs = await _glob(`${dir}/*/`);
    return _dirs.sort();
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) { throw e; }
    return [];
  }
};

/**
 * dir 以下を再帰的に走査し、dirProvider が true を返したディレクトリのみを
 * 絶対パスのリストとして辞書順ソートして返す。
 *
 * dirProvider が true を返したディレクトリはそこで走査を打ち切る（内部を再帰しない）。
 * dirProvider が false を返したディレクトリは結果に含めず、子ディレクトリを再帰的に検索する。
 */
export const findDirectories = async (
  dir: string,
  dirProvider: DirProvider,
  options?: FindDirectoriesOptions,
): Promise<string[]> => {
  const _glob = options?.glob;
  const _dirNorm = normalizePath(dir);

  const _walk = async (currentDir: string): Promise<string[]> => {
    const _subs = await findDirectoriesFlat(currentDir, { glob: _glob });
    const _nested = await Promise.all(
      _subs.map(async (sub) => (await dirProvider(sub)) ? [sub] : _walk(sub)),
    );
    return _nested.flat();
  };

  return (await _walk(_dirNorm)).sort();
};

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
