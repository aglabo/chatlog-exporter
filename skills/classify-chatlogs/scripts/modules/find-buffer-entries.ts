// src: scripts/modules/find-buffer-entries.ts
// @(#): classify-chatlogs バッファエントリ収集モジュール
//       対象: findChatlogFilePaths, loadClassifyEntries
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
  ClassifyBufferEntry,
  ClassifyCache,
  FindBufferEntriesOptions,
} from '../types/classify.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * `ActionStatusEntry` を `ClassifyBufferEntry` に変換するアダプター。
 */
const _toLoadResult = (ase: ActionStatusEntry): ClassifyBufferEntry => ({ entry: ase.entry });

/** `entry.entry` の frontmatter から既存の `project` フィールド（非空文字列）を取得する。なければ `undefined`。 */
const _getExistingProject = (entry: ClassifyBufferEntry): string | undefined => {
  const _project = entry.entry?.frontmatter.get('project');
  return typeof _project === 'string' && _project ? _project : undefined;
};

/** 1件のファイルパスに対して `loadMeta`（省略時は `loadClassifyEntry`）を呼び出し、`ClassifyBufferEntry` を返す。 */
const _loadEntry = async (
  filePath: string,
  cache: ChatlogCache<ClassifyCache>,
  loadMeta?: FindBufferEntriesOptions['loadMeta'],
): Promise<ClassifyBufferEntry> => {
  const _fn = loadMeta ?? loadClassifyEntry;
  return await _fn(filePath, cache);
};
/**
 * ディレクトリ直下（1階層目）の `.md` ファイルパス一覧を収集する。
 */
export const findChatlogFilePaths = (dir: string, opts?: FindBufferEntriesOptions): Promise<string[]> =>
  findFilesFlat(dir, { ext: '.md', glob: opts?.glob });

/**
 * ファイルパス一覧からエントリを読み込み、`ClassifyBufferEntry` 配列を返す。
 * - 読み込み（`loadMeta` または既定の `loadClassifyEntry`）時点で失敗したエントリは、
 *   ローダー自身が `cache` に `action: CLASSIFY_ACTIONS.ERROR` と `reason` を書き込む。
 * - 各エントリについて `cache` に `action`（ローダーが既に書き込んでいなければ `CLASSIFY_ACTIONS.EMPTY`）を
 *   マージ書き込みする。既存キャッシュ（例: 前回 AI 分類済みの `project`）を消さないよう `cache.update` を使う。
 * - frontmatter に `project` があれば同じ書き込みに含める。
 * - `cache` の `action` が `ERROR` のエントリは戻り値から除外する。
 */
export const loadClassifyEntries = async (
  filePaths: string[],
  cache: ChatlogCache<ClassifyCache>,
  opts?: FindBufferEntriesOptions,
): Promise<ClassifyBufferEntry[]> => {
  const _results = await Promise.all(
    filePaths.map((filePath) => _loadEntry(filePath, cache, opts?.loadMeta)),
  );

  await Promise.all(
    _results.map((result) => {
      const _filePath = result.entry.filePath!;
      const _project = _getExistingProject(result);
      // ローダーが既に action: ERROR を書き込んでいる場合はそれを維持し、未設定時のみ EMPTY を既定値にする。
      return cache.update(_filePath, {
        ...(_project ? { project: _project } : {}),
        action: cache.read(_filePath).action ?? CLASSIFY_ACTIONS.EMPTY,
      });
    }),
  );

  return _results
    .filter((result) => cache.read(result.entry.filePath!).action !== CLASSIFY_ACTIONS.ERROR);
};
