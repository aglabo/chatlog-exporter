// src: skills/_scripts/libs/file-ops/walk-files.ts
// @(#): ディレクトリ再帰走査ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * 指定ディレクトリを再帰的に走査し、指定拡張子のファイルパスを辞書順で yield する非同期ジェネレータ。
 * ディレクトリが存在しない・権限エラーの場合は黙認して終了する。
 */
export const walkFiles = async function*(dir: string, ext: string): AsyncGenerator<string> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(dir)) {
      entries.push(e);
    }
  } catch {
    return;
  }

  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = `${dir}/${e.name}`;
    if (e.isDirectory) {
      yield* walkFiles(fullPath, ext);
    } else if (e.isFile && e.name.endsWith(ext)) {
      yield fullPath;
    }
  }
};
