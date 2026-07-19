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
import { loadClassifyEntry } from '../libs/load-classify-entry.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache, FindBufferEntriesOptions } from '../types/classify.types.ts';
import type { LoadClassifyEntryFailure } from '../types/load-classify-entry.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/** `entry` の frontmatter から既存の `project` フィールド（非空文字列）を取得する。なければ `undefined`。 */
const _getExistingProject = (entry: ChatlogEntry): string | undefined => {
  const _project = entry?.frontmatter.get('project');
  return typeof _project === 'string' && _project ? _project : undefined;
};

/**
 * ディレクトリ直下（1階層目）の `.md` ファイルパス一覧を収集する。
 */
export const findChatlogFilePaths = (dir: string, opts?: FindBufferEntriesOptions): Promise<string[]> =>
  findFilesFlat(dir, { ext: '.md', glob: opts?.glob });

/**
 * ファイルパス一覧からエントリを読み込み、成功分（`entries`）と失敗分（`errors`）に分離して返す。
 * - 読み込み（`loadMeta` または既定の `loadClassifyEntry`）に失敗したエントリは `errors` に集約し、
 *   `cache` に `action: CLASSIFY_ACTIONS.ERROR` と `reason` をまとめて書き込む。
 * - 成功したエントリについては `cache` に `action`（未設定時は `CLASSIFY_ACTIONS.EMPTY`）をマージ書き込みする。
 *   既存キャッシュ（例: 前回 AI 分類済みの `project`）を消さないよう `cache.update` を使う。
 * - frontmatter に `project` があれば同じ書き込みに含める。
 */
export const loadClassifyEntries = async (
  filePaths: string[],
  cache: ChatlogCache<ClassifyCache>,
  opts?: FindBufferEntriesOptions,
): Promise<{ entries: ChatlogEntry[]; errors: LoadClassifyEntryFailure[] }> => {
  const _results = await Promise.all(
    filePaths.map((filePath) => opts?.loadMeta ? opts.loadMeta(filePath) : loadClassifyEntry(filePath)),
  );

  const entries = _results.filter((result): result is ChatlogEntry => result instanceof ChatlogEntry);
  const errors = _results.filter((result): result is LoadClassifyEntryFailure => !(result instanceof ChatlogEntry));

  await Promise.all(
    errors.map(({ filePath, error }) =>
      cache.write(filePath, { action: CLASSIFY_ACTIONS.ERROR, reason: error.message })
    ),
  );

  await Promise.all(
    entries.map((entry) => {
      const _filePath = entry.filePath!;
      const _project = _getExistingProject(entry);
      return cache.update(_filePath, {
        ...(_project ? { project: _project } : {}),
        action: cache.read(_filePath).action ?? CLASSIFY_ACTIONS.EMPTY,
      });
    }),
  );

  return { entries, errors };
};
