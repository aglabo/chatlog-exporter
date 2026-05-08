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

export const findMdFiles = (searchDir: string): Promise<string[]> => {
  return findFilesLib(searchDir);
};
