// src: scripts/libs/find-files.ts
// @(#): チャットログ Markdown ファイルの列挙
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import { findFiles as findFilesLib } from '../../../_scripts/libs/file-io/find-files.ts';

// ─────────────────────────────────────────────
// ファイル列挙
// ─────────────────────────────────────────────

const _resolveSearchDir = (baseDir: string, period?: string): string => {
  if (!period) {
    return baseDir;
  }
  return `${baseDir}/${period.slice(0, 4)}/${period}`;
};

export const findMdFiles = (baseDir: string, period?: string): Promise<string[]> => {
  const _searchDir = _resolveSearchDir(baseDir, period);
  return findFilesLib(_searchDir);
};
