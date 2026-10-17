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
import { isSafeProjectName } from './project-name.ts';
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

/** `value` が安全なプロジェクト名（`isSafeProjectName`）で、かつ `projects`（プロジェクト辞書）のキーであるか判定する。 */
const _isKnownProject = (value: unknown, projects: ProjectDicEntry): value is string =>
  isSafeProjectName(value) && Object.hasOwn(projects, value);

/**
 * `entry` の frontmatter から既存の `project` フィールドを取得する。
 * 安全なプロジェクト名（`isSafeProjectName`）であれば、プロジェクト辞書の有無にかかわらずそのまま返す（frontmatter 優先）。
 * 空・非文字列・パス区切りや相対参照を含む unsafe な値は未指定として扱い、`undefined` を返す。
 */
const _getExistingProject = (entry: ChatlogEntry): string | undefined => {
  const _project = entry?.frontmatter.get('project');
  return isSafeProjectName(_project) ? _project : undefined;
};

/**
 * ファイルパス一覧からエントリを読み込み、成功分（`entries`）と失敗分（`errors`）に分離して返す。
 * - 読み込み（`loadMeta` または既定の `loadClassifyEntry`）に失敗したエントリは `errors` に集約し、
 *   `cache` に `action: CLASSIFY_ACTIONS.ERROR` と `reason` をまとめて書き込む。
 * - 成功したエントリについては `cache` に `action`（未設定時は `CLASSIFY_ACTIONS.EMPTY`）を書き込む。
 *   既存キャッシュ（例: 前回 AI 分類済みの `confidence` / `reason`）を消さないよう既存値を引き継ぐ。
 * - frontmatter の `project` が安全なプロジェクト名（`isSafeProjectName`）なら、`projects`（プロジェクト辞書）に
 *   無い値でも同じ書き込みに含める（frontmatter 優先。`partitionEntries` で `cached` に回り、AI を通さず移動される）。
 * - frontmatter に `project` が無い・空・unsafe（`.` / `..` / `/` `\` `:` を含む）のときは未指定として扱い、
 *   cache に残っている `project` を `projects` で検証し、
 *   辞書外なら落とす（`--dry-run` や中断した実行が残した stale な値を、
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
      const _project = _getExistingProject(entry)
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
