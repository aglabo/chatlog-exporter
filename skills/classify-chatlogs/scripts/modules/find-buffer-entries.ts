// src: scripts/modules/find-buffer-entries.ts
// @(#): classify-chatlogs バッファエントリ収集モジュール
//       対象: findBufferEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:word noai

// ─── Shared scripts
import { findEntries } from '../../../_scripts/libs/file-ops/find-entries.ts';

// ─── Local
import { loadClassifyEntry } from './classify-noai.ts';
// types
import type { ActionStatusEntry } from '../../../_scripts/types/action-status-entry.types.ts';
import type {
  ClassifyBuffer,
  ClassifyBufferEntry,
  ClassifyStats,
  FindBufferEntriesOptions,
} from '../types/classify.types.ts';
// constants
import { ENTRY_ACTIONS } from '../../../_scripts/types/action-status.types.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/** `ActionStatusEntry` を `ClassifyBufferEntry` に変換するアダプター。 */
const _toBufferEntry = (ase: ActionStatusEntry): ClassifyBufferEntry => {
  const _isError = ase.options.action === ENTRY_ACTIONS.ERROR;
  return {
    file: _isError ? null : ase.entry,
    filePath: ase.options.filePath,
    action: _isError ? CLASSIFY_ACTIONS.ERROR : undefined,
    reason: ase.options.reason,
  };
};

/**
 * ディレクトリ配下の `.md` ファイルを収集し、メタデータを読み込んで分類バッファを返す。
 * - `loadMeta` が `action: 'error'` のエントリを返したファイルはスキップし、`stats.error` をインクリメントする。
 */
export const findBufferEntries = async (
  dir: string,
  opts?: FindBufferEntriesOptions,
  stats?: ClassifyStats,
): Promise<ClassifyBuffer> => {
  const _files = await findEntries([dir], '.md', { glob: opts?.glob });

  const _entries = await Promise.all(
    _files.map(async (filePath): Promise<ClassifyBufferEntry> => {
      let _entry: ClassifyBufferEntry;
      if (opts?.loadMeta) {
        _entry = await opts.loadMeta(filePath);
      } else {
        const _ase = await loadClassifyEntry(filePath);
        _entry = _toBufferEntry(_ase);
      }
      if (_entry.action === CLASSIFY_ACTIONS.ERROR && stats) { stats.error++; }
      return _entry;
    }),
  );

  return _entries.filter((entry) => entry.action !== CLASSIFY_ACTIONS.ERROR);
};
