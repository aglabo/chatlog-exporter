// src: scripts/modules/prefilter/process-noise-files.ts
// @(#): ノイズファイルのリスト処理（分類・削除・dry-run・report）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../../_scripts/libs/path-utils/path-utils.ts';
import { classifyFile } from '../../libs/classify-file.ts';

// ─────────────────────────────────────────────
// ファイルリスト処理
// ─────────────────────────────────────────────

export const processNoiseFiles = async (
  files: string[],
  stats: { noise: number; keep: number; error: number },
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
        stats.noise++;
      } else if (dryRun) {
        logger.log(filePath);
        stats.noise++;
      } else {
        if (await removeFile(filePath)) {
          logger.info(`deleted: ${filePath}`);
          stats.noise++;
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
