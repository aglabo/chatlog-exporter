// src: skills/_scripts/libs/file-io/write-utils.ts
// @(#): ファイル書き込みユーティリティ
//       対象: writeTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules───────────────────────────
// functions
import { normalizeLine } from '../text/line-utils.ts';

// ─── Functions

/**
 * Writes `content` to `outputPath` using a tmp-then-rename atomic pattern.
 *
 * Writes to `outputPath + ".tmp"`, then renames to `outputPath`.
 * Does not back up an existing file at `outputPath` — callers that need a backup
 * before overwrite must do so before calling this function.
 *
 * @param outputPath - Destination file path
 * @param content    - Text content to write
 */
export const writeTextFile = async (
  outputPath: string,
  content: string,
): Promise<void> => {
  const tmpPath = outputPath + '.tmp';
  await Deno.writeTextFile(tmpPath, normalizeLine(content));
  try {
    await Deno.rename(tmpPath, outputPath);
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      throw e;
    }
    await Deno.remove(outputPath);
    await Deno.rename(tmpPath, outputPath);
  }
};
