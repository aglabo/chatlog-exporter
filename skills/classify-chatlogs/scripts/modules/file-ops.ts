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
import type { ClassifyBuffer, ClassifyStats } from '../types/classify.types.ts';

/**
 * 1ファイルを指定プロジェクトのサブディレクトリへ移動し、フロントマターを更新する。
 * - `project` が `undefined` の場合はスキップして `stats.skipped++` し、警告ログを出力する。
 * - `dryRun` が `true` の場合は移動せずログのみ出力してカウンターをインクリメントする。
 * - `byAI` が `true` の場合は `stats.movedByAI`、`false` の場合は `stats.moved` をインクリメントする。
 * - 移動エラーは `stats.error` をインクリメントしてログに記録する（スローしない）。
 */
export const classifyFile = async (
  fileMeta: ClassifyChatlogEntry,
  project: string | undefined,
  destDir: string,
  dryRun: boolean,
  stats: ClassifyStats,
  byAI: boolean = false,
): Promise<void> => {
  if (project === undefined) {
    logger.warn(`[skip: no-project] ${fileMeta.filename}`);
    stats.skipped++;
    return;
  }
  const srcPath = fileMeta.filePath;
  const _projectDir = normalizePath(`${destDir}/${project}`);
  const dstPath = `${_projectDir}/${fileMeta.filename}`;

  if (dryRun) {
    logger.info(`[dry-run] ${fileMeta.filename} → ${project}/`);
    if (byAI) { stats.movedByAI++; }
    else { stats.moved++; }
    return;
  }

  try {
    await Deno.mkdir(_projectDir, { recursive: true }); // await Deno.mkdir(projectDir, { recursive: true });
    await Deno.rename(srcPath, dstPath);

    fileMeta.frontmatter.set('project', project);
    const newText = fileMeta.renderEntry();
    await Deno.writeTextFile(dstPath, normalizeLine(newText));

    logger.info(`moved: ${fileMeta.filename} → ${project}/`);
    if (byAI) { stats.movedByAI++; }
    else { stats.moved++; }
  } catch (e) {
    logger.error(`  移動失敗: ${fileMeta.filename}: ${e}`);
    stats.error++;
  }
};

/**
 * 分類バッファの各エントリを実際の処理（ファイル移動またはスキップ）に適用する。
 * - `action === 'move'` → `classifyFile` を呼び出してファイルを移動する（移動先: `destDir/{project}/`）
 * - `action === 'skip'` → `stats.skipped++` のみ（ファイル移動なし）、ログ出力
 * - `action === 'remaining'` → `stats.remaining++`（ログなし）
 * - それ以外（`undefined` 等）→ `stats.remaining++`（ログなし）
 */
export const moveClassified = async (
  buffer: ClassifyBuffer,
  destDir: string,
  dryRun: boolean,
  stats: ClassifyStats,
): Promise<void> => {
  for (const entry of buffer) {
    if (entry.action === 'skip') {
      logger.info(`  skipped (分類済み: ${entry.project}): ${entry.file.filename}`);
      stats.skipped++;
    } else if (entry.action === 'remaining' || entry.action === undefined) {
      stats.remaining++;
    } else if (entry.project !== undefined) {
      await classifyFile(entry.file, entry.project, destDir, dryRun, stats, entry.byAI);
    }
  }
};
