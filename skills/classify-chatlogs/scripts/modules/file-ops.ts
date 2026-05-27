// src: scripts/modules/file-ops.ts
// @(#): classify-chatlogs ファイル移動モジュール
//       対象: classifyFile / moveClassified
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI

// --- import ---
// functions
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';

// types
import type { ClassifyAction, ClassifyBuffer, ClassifyStats } from '../types/classify.types.ts';

// classes
import { ClassifyChatlogEntry } from '../classes/ClassifyChatlogEntry.class.ts';

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
export const classifyFile = async (
  classifyEntry: ClassifyChatlogEntry,
  project: string | undefined,
  destDir: string,
  dryRun: boolean,
): Promise<{ action: ClassifyAction; message: string }> => {
  const _project = resolveProject(project);
  const srcPath = classifyEntry.filePath;
  const _projectDir = normalizePath(`${destDir}/${_project}`);
  const dstPath = `${_projectDir}/${classifyEntry.filename}`;

  if (dryRun) {
    return { action: CLASSIFY_ACTIONS.MOVE, message: `[dry-run] ${classifyEntry.filename} → ${_project}/` };
  }

  try {
    await Deno.mkdir(_projectDir, { recursive: true });
    classifyEntry.frontmatter.set('project', _project);
    const _newContent = normalizeLine(classifyEntry.renderEntry());
    await Deno.writeTextFile(dstPath, _newContent);
    await Deno.remove(srcPath);

    return { action: CLASSIFY_ACTIONS.MOVE, message: `moved: ${classifyEntry.filename} → ${_project}/` };
  } catch (e) {
    return { action: CLASSIFY_ACTIONS.ERROR, message: `  move failed: ${classifyEntry.filename}: ${e}` };
  }
};

/**
 * 分類バッファの各エントリを実際の処理（ファイル移動またはスキップ）に適用する。
 * - `action === 'move'` → `classifyFile` を呼び出してファイルを移動する（移動先: `destDir/{project}/`）
 *   - `project` が `undefined` の場合は `FALLBACK_PROJECT` へ補完する
 * - `action === 'move-by-ai'` → `classifyFile` を呼び出してファイルを移動し、`stats.movedByAI` をインクリメントする
 * - `action === 'skip'` → `stats.skipped++` のみ（ファイル移動なし）、ログ出力
 * - `action === 'remaining'` → `stats.remaining++`（ログなし）
 * - `action === 'error'` → `stats.error++`（ファイル移動なし）、警告ログ出力
 * - それ以外（`undefined` 等）→ `stats.remaining++`（ログなし）
 */
export const moveClassified = async (
  buffer: ClassifyBuffer,
  destDir: string,
  dryRun: boolean,
  stats: ClassifyStats,
): Promise<void> => {
  for (const entry of buffer) {
    const action = entry.action ?? CLASSIFY_ACTIONS.REMAINING;
    switch (action) {
      case CLASSIFY_ACTIONS.SKIP:
        logger.info(`  skipped (分類済み: ${entry.project}): ${entry.file!.filename}`);
        stats.skipped++;
        break;
      case CLASSIFY_ACTIONS.REMAINING:
        stats.remaining++;
        break;
      case CLASSIFY_ACTIONS.ERROR:
        logger.warn(`  AI 分類失敗: ${entry.filePath}`);
        stats.error++;
        break;
      case CLASSIFY_ACTIONS.MOVE: {
        const _result = await classifyFile(entry.file!, entry.project, destDir, dryRun);
        if (_result.action === CLASSIFY_ACTIONS.MOVE) {
          logger.info(_result.message);
          stats.moved++;
        } else {
          logger.error(_result.message);
          stats.error++;
        }
        break;
      }
      case CLASSIFY_ACTIONS.MOVEBYAI: {
        const _result = await classifyFile(entry.file!, entry.project, destDir, dryRun);
        if (_result.action === CLASSIFY_ACTIONS.MOVE) {
          logger.info(_result.message);
          stats.movedByAI++;
        } else {
          logger.error(_result.message);
          stats.error++;
        }
        break;
      }
    }
  }
};
