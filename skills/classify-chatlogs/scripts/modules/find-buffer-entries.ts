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
import { findFilesFlat } from '../../../_scripts/libs/file-ops/find-files.ts';

// ─── Local
import { loadClassifyEntry } from './classify-noai.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ActionStatusEntry } from '../../../_scripts/types/action-status-entry.types.ts';
import type {
  ClassifyBuffer,
  ClassifyBufferEntry,
  ClassifyEntry,
  ClassifyResult,
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
    file: ase.entry,
    action: _isError ? CLASSIFY_ACTIONS.ERROR : undefined,
    reason: ase.options.reason,
  };
};

/** `entry.file` の frontmatter から既存の `project` フィールド（非空文字列）を取得する。なければ `undefined`。 */
const _getExistingProject = (entry: ClassifyBufferEntry): string | undefined => {
  const _project = entry.file?.frontmatter.get('project');
  return typeof _project === 'string' && _project ? _project : undefined;
};

/** 1件のファイルパスに対して `loadMeta`（省略時は `loadClassifyEntry`）を呼び出し、`ClassifyBufferEntry` を返す。 */
const _loadEntry = async (
  filePath: string,
  loadMeta?: FindBufferEntriesOptions['loadMeta'],
): Promise<ClassifyBufferEntry> =>
  loadMeta ? await loadMeta(filePath) : _toBufferEntry(await loadClassifyEntry(filePath));

/**
 * ディレクトリ直下（1階層目）の `.md` ファイルパス一覧を収集する。
 */
export const findChatlogFilePaths = (dir: string, opts?: FindBufferEntriesOptions): Promise<string[]> =>
  findFilesFlat(dir, { ext: '.md', glob: opts?.glob });

/**
 * ファイルパス一覧からエントリを読み込み、`ClassifyEntry` 配列を返す。
 * - 読み込み成功時、frontmatter に `project` があれば `cache` に `{ project }` を書き込む。
 * - 読み込み失敗（`action: 'error'`）時は `cache` に `{ status: CLASSIFY_ACTIONS.ERROR }` を書き込み、
 *   戻り値から除外し `stats.error` をインクリメントする。
 */
export const loadClassifyEntries = async (
  filePaths: string[],
  cache: ChatlogCache<ClassifyResult>,
  opts?: FindBufferEntriesOptions,
  stats?: ClassifyStats,
): Promise<ClassifyEntry[]> => {
  const _entries = await Promise.all(
    filePaths.map((filePath) => _loadEntry(filePath, opts?.loadMeta)),
  );

  await Promise.all(
    _entries.map((entry) => {
      if (entry.action === CLASSIFY_ACTIONS.ERROR) {
        if (stats) { stats.error++; }
        return cache.write(entry.file.filePath!, { status: CLASSIFY_ACTIONS.ERROR });
      }
      const _project = _getExistingProject(entry);
      return _project ? cache.write(entry.file.filePath!, { project: _project }) : Promise.resolve();
    }),
  );

  return _entries
    .filter((entry) => entry.action !== CLASSIFY_ACTIONS.ERROR)
    .map((entry) => ({ file: entry.file, filePath: entry.file.filePath! }));
};

/**
 * ディレクトリ直下（1階層目）の `.md` ファイルを収集し、メタデータを読み込んで分類バッファを返す。
 * - `loadMeta` が `action: 'error'` のエントリを返したファイルはスキップし、`stats.error` をインクリメントする。
 */
export const findBufferEntries = async (
  dir: string,
  opts?: FindBufferEntriesOptions,
  stats?: ClassifyStats,
): Promise<ClassifyBuffer> => {
  const _files = await findFilesFlat(dir, { ext: '.md', glob: opts?.glob });

  const _entries = await Promise.all(
    _files.map(async (filePath) => {
      const _entry = await _loadEntry(filePath, opts?.loadMeta);
      if (_entry.action === CLASSIFY_ACTIONS.ERROR && stats) { stats.error++; }
      return _entry;
    }),
  );

  return _entries.filter((entry) => entry.action !== CLASSIFY_ACTIONS.ERROR);
};
