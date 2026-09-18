// src: scripts/libs/load-entries.ts
// @(#): classify-chatlogs バッファエントリ読み込みユーティリティ
//       対象: loadClassifyEntries
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
import { runConcurrent } from '../../../_cle-libs/libs/parallel/concurrency.ts';

// ─── Local
import { loadClassifyEntry } from './load-classify-entry.ts';
// types
import type { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import type {
  ClassifyCache,
  ClassifyConfig,
  FindBufferEntriesOptions,
  ProjectDicEntry,
} from '../types/classify.types.ts';
import type { LoadClassifyEntryFailure } from '../types/load-classify-entry.types.ts';
// constants
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/** `value` が非空文字列で、かつ `projects`（プロジェクト辞書）のキーであるか判定する。 */
const _isKnownProject = (value: unknown, projects: ProjectDicEntry): value is string =>
  typeof value === 'string' && value !== '' && Object.hasOwn(projects, value);

/**
 * `entry` の frontmatter から既存の `project` フィールドを取得する。
 * 非空文字列であり、かつ `projects`（プロジェクト辞書）に存在する値のみを返す。それ以外は `undefined`。
 */
const _getExistingProject = (entry: ChatlogEntry, projects: ProjectDicEntry): string | undefined => {
  const _project = entry?.frontmatter.get('project');
  return _isKnownProject(_project, projects) ? _project : undefined;
};

/**
 * ファイルパス一覧からエントリを読み込み、成功分（`entries`）と失敗分（`errors`）に分離して返す。
 * - 読み込み（`loadMeta` または既定の `loadClassifyEntry`）に失敗したエントリは `errors` に集約し、
 *   `cache` に `action: CLASSIFY_ACTIONS.ERROR` と `reason` をまとめて書き込む。
 * - 成功したエントリについては `cache` に `action`（未設定時は `CLASSIFY_ACTIONS.EMPTY`）を書き込む。
 *   既存キャッシュ（例: 前回 AI 分類済みの `confidence` / `reason`）を消さないよう既存値を引き継ぐ。
 * - frontmatter の `project` は、`projects`（プロジェクト辞書）に存在する値のときだけ同じ書き込みに含める。
 *   辞書外の値は書き込まない（`partitionEntries` で `uncached` に回り、後続の分類で辞書から選ばれる）。
 * - cache に残っている辞書外 `project` も同様に落とす（`--dry-run` や中断した実行が残した stale な値を、
 *   辞書外ディレクトリへ移動される前にここで正規化する）。
 */
export const loadClassifyEntries = async (
  filePaths: string[],
  cache: ChatlogCache<ClassifyCache>,
  config: Pick<ClassifyConfig, 'concurrency'>,
  projects: ProjectDicEntry,
  opts?: FindBufferEntriesOptions,
): Promise<{ entries: ChatlogEntry[]; errors: LoadClassifyEntryFailure[] }> => {
  const _results = await runConcurrent(
    filePaths,
    (filePath) => opts?.loadMeta ? opts.loadMeta(filePath) : loadClassifyEntry(filePath),
    config.concurrency,
  );

  const entries = _results.filter((result): result is ChatlogEntry => result instanceof ChatlogEntry);
  const errors = _results.filter((result): result is LoadClassifyEntryFailure => !(result instanceof ChatlogEntry));

  await runConcurrent(
    errors,
    ({ filePath, error }) => cache.write(filePath, { action: CLASSIFY_ACTIONS.ERROR, reason: error.message }),
    config.concurrency,
  );

  await runConcurrent(
    entries,
    (entry) => {
      const _filePath = entry.filePath!;
      const _cached = cache.read(_filePath);
      const { project: _staleProject, ..._rest } = _cached;
      const _project = _getExistingProject(entry, projects)
        ?? (_isKnownProject(_staleProject, projects) ? _staleProject : undefined);
      return cache.write(_filePath, {
        ..._rest,
        ...(_project ? { project: _project } : {}),
        action: _cached.action ?? CLASSIFY_ACTIONS.EMPTY,
      });
    },
    config.concurrency,
  );

  return { entries, errors };
};
