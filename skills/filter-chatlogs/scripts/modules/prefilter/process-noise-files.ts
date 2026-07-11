// src: scripts/modules/prefilter/process-noise-files.ts
// @(#): ノイズファイルのリスト処理（分類・削除・dry-run・report）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// functions
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../../_scripts/libs/path-utils/path-utils.ts';

// ─── internal ───
// types
import type { PrefilterStats } from '../../types/stats.types.ts';
// functions
import { classifyFile } from '../../libs/classify-file.ts';

// ─────────────────────────────────────────────
// ファイルリスト処理
// ─────────────────────────────────────────────

export const processNoiseFiles = async (
  files: string[],
  stats: PrefilterStats,
  options: { dryRun: boolean; report: boolean },
): Promise<void> => {
  const { dryRun, report } = options;

  for (const filePath of files) {
    const filename = getFilename(filePath);

    let text: string;
    try {
      text = await readTextFile(filePath);
    } catch (e) {
      logger.error(`  error (${filename}): ${e}`);
      stats.error++;
      continue;
    }

    const { isNoise, reason } = classifyFile(filename, text);

    if (isNoise) {
      if (report) {
        logger.log(`NOISE\t${reason}\t${filePath}`);
        stats.skip++;
      } else if (dryRun) {
        logger.log(filePath);
        stats.skip++;
      } else {
        if (await removeFile(filePath)) {
          logger.info(`deleted: ${filePath}`);
          stats.remove++;
        } else {
          logger.warn(`  Skipped (File not found): ${filename}`);
          stats.error++;
        }
      }
    } else {
      stats.keep++;
    }
  }
};
