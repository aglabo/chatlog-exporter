// src: scripts/modules/setfm-entry-loader.ts
// @(#): チャットログエントリ読み込みモジュール
//       対象: loadAllEntries / loadChatlogEntry
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import { loadChatlogEntry as _loadEntry } from '../../../_scripts/libs/file-io/chatlog-entry-loader.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// classes
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';

// ─── Local
// types
import type { Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// ファイルメタ読み込み
// ─────────────────────────────────────────────

export const loadAllEntries = async (
  dir: string,
  stats: Stats,
  concurrency: number,
): Promise<ChatlogEntry[]> => {
  const allFiles = await findFiles(dir);
  stats.total = allFiles.length;
  logger.info(`対象ファイル数: ${stats.total}`);

  const _results = await runConcurrent(allFiles, loadChatlogEntry, concurrency);

  allFiles
    .filter((_, i) => !_results[i])
    .forEach((filePath) => logger.warn(`${LOGGER_TEXT.INDENT}skip: ${getFilename(filePath)}`));

  const _entries = _results.filter((e): e is ChatlogEntry => e !== null);
  stats.skip = allFiles.length - _entries.length;
  return _entries;
};

export const loadChatlogEntry = async (filePath: string): Promise<ChatlogEntry | null> => {
  let entry: ChatlogEntry;
  try {
    entry = await _loadEntry(filePath);
  } catch (e) {
    if (e instanceof ChatlogError && e.kind === 'FileDirNotFound') {
      return null;
    }
    throw e;
  }

  const fullBody = entry.content;
  if (!/^#/m.test(fullBody)) { return null; }
  if (!fullBody.trim()) { return null; }

  return entry;
};
