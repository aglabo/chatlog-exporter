// src: scripts/modules/find-buffer-entries.ts
// @(#): classify-chatlogs バッファエントリ収集モジュール
//       対象: findBufferEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:word noai

// -- external --
import { findEntries } from '../../../_scripts/libs/file-ops/find-entries.ts';

// -- internal --
// types
import type {
  ClassifyBuffer,
  ClassifyBufferEntry,
  ClassifyStats,
  FindBufferEntriesOptions,
} from '../types/classify.types.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

// -- modules --
import { loadClassifyEntry } from './classify-noai.ts';

/**
 * ディレクトリ配下の `.md` ファイルを収集し、メタデータを読み込んで分類バッファを返す。
 * - `loadMeta` が `action: 'error'` のエントリを返したファイルはスキップし、`stats.error` をインクリメントする。
 */
export const findBufferEntries = async (
  dir: string,
  opts?: FindBufferEntriesOptions,
  stats?: ClassifyStats,
): Promise<ClassifyBuffer> => {
  const _loadMeta = opts?.loadMeta ?? loadClassifyEntry;
  const _files = await findEntries([dir], '.md', { glob: opts?.glob });

  const _entries = await Promise.all(
    _files.map(async (filePath): Promise<ClassifyBufferEntry> => {
      const _entry = await _loadMeta(filePath);
      if (_entry.action === CLASSIFY_ACTIONS.ERROR && stats) { stats.error++; }
      return _entry;
    }),
  );

  return _entries.filter((entry) => entry.action !== CLASSIFY_ACTIONS.ERROR);
};
