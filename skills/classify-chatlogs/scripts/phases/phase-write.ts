// src: scripts/phases/phase-write.ts
// @(#): classify-chatlogs ファイル移動モジュール
//       対象: moveChatlogEntry / applyClassifications
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI

// ─── Shared scripts
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';

// ─── Local
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type { ClassifyAction, ClassifyCache, ClassifyConfig, ClassifyStats } from '../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/** `project` が `undefined` の場合は `FALLBACK_PROJECT` を返す。 */
export const resolveProject = (project: string | undefined): string => project ?? FALLBACK_PROJECT;

/**
 * 1ファイルを指定プロジェクトのサブディレクトリへ移動し、フロントマターを更新する。
 * 副作用（ログ出力・stats 更新）は呼び出し元が戻り値の `action` に応じて行う。
 * - `project` が `undefined` の場合は `FALLBACK_PROJECT` に補完して移動する。
 * - `dryRun` が `true` の場合は移動せず `{ action: MOVE, message }` を返す。
 * - 移動エラーは `{ action: ERROR, message }` を返す（スローしない）。
 */
export const moveChatlogEntry = async (
  classifyEntry: ChatlogEntry,
  project: string | undefined,
  destDir: string,
  dryRun: boolean,
): Promise<{ action: ClassifyAction; message: string }> => {
  const _project = resolveProject(project);
  const srcPath = classifyEntry.filePath!;
  const _projectDir = normalizePath(`${destDir}/${_project}`);
  const dstPath = `${_projectDir}/${classifyEntry.filename!}`;

  if (dryRun) {
    return { action: CLASSIFY_ACTIONS.MOVE, message: `[dry-run] ${classifyEntry.filename!} → ${_project}/` };
  }

  try {
    await Deno.mkdir(_projectDir, { recursive: true });
    classifyEntry.frontmatter.set('project', _project);
    const _newContent = normalizeLine(classifyEntry.renderEntry());
    await Deno.writeTextFile(dstPath, _newContent);
    await Deno.remove(srcPath);

    return { action: CLASSIFY_ACTIONS.MOVE, message: `moved: ${classifyEntry.filename!} → ${_project}/` };
  } catch (e) {
    return { action: CLASSIFY_ACTIONS.ERROR, message: `  move failed: ${classifyEntry.filename!}: ${e}` };
  }
};

/**
 * `MOVE`/`MOVEBYAI` の分類結果を実際にファイル移動し、成功時に stats を更新してキャッシュを削除する。
 * 失敗時は `stats.error++` のみ（キャッシュは削除しない）。
 */
const _applyMove = async (
  filePath: string,
  entry: ChatlogEntry,
  cached: Partial<ClassifyCache>,
  destDir: string,
  dryRun: boolean,
  cache: ChatlogCache<ClassifyCache>,
  stats: ClassifyStats,
  movedCounter: 'moved' | 'movedByAI',
): Promise<void> => {
  const _result = await moveChatlogEntry(entry, cached.project, destDir, dryRun);
  if (_result.action !== CLASSIFY_ACTIONS.MOVE) {
    logger.error(_result.message);
    stats.error++;
    return;
  }
  logger.info(_result.message);
  stats[movedCounter]++;
  if (!dryRun) {
    await cache.delete(filePath);
  }
};

/**
 * 分類結果キャッシュに基づき、各ファイルへ実際の処理（ファイル移動または保留）を適用する。
 *
 * `entries` は未分類（今回処理対象）のファイル集合であるため、判定は基本的に `cached.project` の
 * 有無による二値判定とする（`action` の値は move/remaining の判定には使わない）。
 * 例外として `action === CLASSIFY_ACTIONS.SKIP`（dry-run で AI 呼び出しをスキップしたエントリ）
 * のみ `action` を見て `stats.skip` に個別カウントする。
 *
 * `dryRun === true` の場合は `cached.project` の有無や `action` の種類に関わらず、
 * `moveChatlogEntry`（ファイル移動処理）を一切呼び出さない。project が確定済みのケースも
 * `stats.skip++` として扱い、専用ログ `<<dry-run>> move skipped: <filename>` を出力する。
 *
 * - `dryRun === true`:
 *   - `cached.action === CLASSIFY_ACTIONS.SKIP` → `stats.skip++`（ログなし）
 *   - `cached.project` が falsy → `stats.remaining++`（ログなし）
 *   - それ以外（project 確定済み）→ `stats.skip++` し `<<dry-run>> move skipped: <filename>` をログ出力（move は呼ばない）
 * - `dryRun === false`:
 *   - `cached.action === CLASSIFY_ACTIONS.SKIP` → `stats.skip++`（ログなし、キャッシュ削除もしない）
 *   - `cached.project` が truthy → `moveChatlogEntry` を呼び出してファイルを移動する（移動先: `destDir/{project}/`）
 *     - 移動成功時はキャッシュエントリを削除する
 *     - `action === 'move-by-ai'` のときのみ `stats.movedByAI` を、それ以外は `stats.moved` をインクリメントする
 *   - `cached.project` が falsy → `stats.remaining++`（ログなし）
 */
export const applyClassifications = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
  destDir: string,
  dryRun: boolean,
  stats: ClassifyStats,
  config: Pick<ClassifyConfig, 'concurrency'>,
): Promise<void> => {
  await runConcurrent(entries, async (entry) => {
    const filePath = entry.filePath!;
    const cached = cache.read(filePath);

    if (cached.action === CLASSIFY_ACTIONS.SKIP) {
      stats.skip++;
      return;
    }

    if (!cached.project) {
      stats.remaining++;
      return;
    }

    if (dryRun) {
      stats.skip++;
      logger.info(`<<dry-run>> move skipped: ${entry.filename!}`);
      return;
    }

    const movedCounter = cached.action === CLASSIFY_ACTIONS.MOVEBYAI ? 'movedByAI' : 'moved';
    await _applyMove(filePath, entry, cached, destDir, dryRun, cache, stats, movedCounter);
  }, config.concurrency);
};
