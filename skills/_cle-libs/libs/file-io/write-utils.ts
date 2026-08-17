// src: skills/_cle-libs/libs/file-io/write-utils.ts
// @(#): ファイル書き込みユーティリティ
//       対象: writeTextFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared modules───────────────────────────
// functions
import { removeFile } from '../file-ops/remove-utils.ts';
import { normalizeLine } from '../text/line-utils.ts';
// types
import type { BackupProvider } from '../../types/providers.types.ts';

// ─── Functions

/**
 * Writes `content` to `outputPath` using a tmp-then-rename atomic pattern.
 *
 * Writes to `outputPath + ".tmp"`, then renames to `outputPath`.
 *
 * When `backup` is supplied, it is invoked after the tmp file has been written but
 * before the final rename, so an existing file at `outputPath` is still intact at
 * that point. A rejecting `backup` propagates and aborts the overwrite. When
 * `backup` is omitted, no backup is taken and the existing file is overwritten.
 *
 * A `null` return from `backup` reports "no backup was made"; it does not abort
 * the write (DR-03). If `backup` or the final rename fails, the tmp file is
 * removed on a best-effort basis and the original error propagates unchanged.
 *
 * Note: in the `AlreadyExists` recovery path the existing file is removed before
 * the retried rename. If that retry fails, neither the original nor the new
 * content survives.
 *
 * @param outputPath - Destination file path
 * @param content    - Text content to write
 * @param backup     - Optional provider that backs up an existing `outputPath`
 * @returns The backup path created by `backup`, or `null` when no backup was made
 */
export const writeTextFile = async (
  outputPath: string,
  content: string,
  backup?: BackupProvider,
): Promise<string | null> => {
  const tmpPath = outputPath + '.tmp';
  await Deno.writeTextFile(tmpPath, normalizeLine(content));
  try {
    const _backupPath = backup ? await backup(outputPath) : null;
    try {
      await Deno.rename(tmpPath, outputPath);
    } catch (e) {
      if (!(e instanceof Deno.errors.AlreadyExists)) {
        throw e;
      }
      await Deno.remove(outputPath);
      await Deno.rename(tmpPath, outputPath);
    }
    return _backupPath;
  } catch (e) {
    await removeFile(tmpPath, { throwFileIoError: false });
    throw e;
  }
};
