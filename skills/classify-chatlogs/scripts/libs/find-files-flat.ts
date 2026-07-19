// src: scripts/libs/find-files-flat.ts
// @(#): classify-chatlogs ファイル探索ユーティリティ
//       対象: findChatlogFilePaths
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { findFilesFlat } from '../../../_scripts/libs/file-ops/find-files.ts';

// ─── Local
// types
import type { FindBufferEntriesOptions } from '../types/classify.types.ts';

/**
 * ディレクトリ直下（1階層目）の `.md` ファイルパス一覧を収集する。
 */
export const findChatlogFilePaths = (dir: string, opts?: FindBufferEntriesOptions): Promise<string[]> =>
  findFilesFlat(dir, { ext: '.md', glob: opts?.glob });
