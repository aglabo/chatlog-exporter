// src: scripts/modules/file-ops.ts
// @(#): classify-chatlogs ファイル移動モジュール
//       対象: classifyFile / moveClassified
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { logger } from '../../../_scripts/libs/io/logger.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { normalizeLine } from '../../../_scripts/libs/text/line-utils.ts';
import { ClassifyChatlogEntry } from '../classes/ClassifyChatlogEntry.class.ts';
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';
import type { ClassifyBuffer, ClassifyStats } from '../types/classify.types.ts';

/**
 * 1ファイルを指定プロジェクトのサブディレクトリへ移動し、フロントマターを更新する。
 * - `project` が `undefined` の場合はスキップして `stats.skipped++` し、警告ログを出力する。
 * - `dryRun` が `true` の場合は移動せずログのみ出力してカウンターをインクリメントする。
 * - `byAI` が `true` の場合は `stats.movedByAI`、`false` の場合は `stats.moved` をインクリメントする。
 * - 移動エラーは `stats.error` をインクリメントしてログに記録する（スローしない）。
 */
export const classifyFile = async (
  classifyEntry: ClassifyChatlogEntry,
  project: string | undefined,
  destDir: string,
  dryRun: boolean,
  stats: ClassifyStats,
  byAI: boolean = false,
): Promise<void> => {
  if (project === undefined) {
    logger.warn(`[skip: no-project] ${classifyEntry.filename}`);
    stats.skipped++;
    return;
  }
  const srcPath = classifyEntry.filePath;
  const _projectDir = normalizePath(`${destDir}/${project}`);
  const dstPath = `${_projectDir}/${classifyEntry.filename}`;

  if (dryRun) {
    logger.info(`[dry-run] ${classifyEntry.filename} → ${project}/`);
    if (byAI) { stats.movedByAI++; }
    else { stats.moved++; }
    return;
  }

  try {
    await Deno.mkdir(_projectDir, { recursive: true });
    classifyEntry.frontmatter.set('project', project);
    const _newContent = normalizeLine(classifyEntry.renderEntry());
    await Deno.writeTextFile(dstPath, _newContent);
    await Deno.remove(srcPath);

    logger.info(`moved: ${classifyEntry.filename} → ${project}/`);
    if (byAI) { stats.movedByAI++; }
    else { stats.moved++; }
  } catch (e) {
    logger.error(`  移動失敗: ${classifyEntry.filename}: ${e}`);
    stats.error++;
  }
};

/** `project` が `undefined` の場合は `FALLBACK_PROJECT` を返す。 */
const _resolveProject = (project: string | undefined): string => project ?? FALLBACK_PROJECT;

/**
 * 分類バッファの各エントリを実際の処理（ファイル移動またはスキップ）に適用する。
 * - `action === 'move'` → `classifyFile` を呼び出してファイルを移動する（移動先: `destDir/{project}/`）
 *   - `project` が `undefined` の場合は `FALLBACK_PROJECT` へ補完する
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
      default:
        await classifyFile(entry.file!, _resolveProject(entry.project), destDir, dryRun, stats, entry.byAI);
    }
  }
};
