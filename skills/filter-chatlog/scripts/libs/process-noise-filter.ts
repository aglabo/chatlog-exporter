// src: scripts/libs/process-noise-filter.ts
// @(#): ノイズファイルのリスト処理（分類・削除・dry-run・report）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { classifyFile } from './classify-file.ts';

// ─────────────────────────────────────────────
// ファイルリスト処理
// ─────────────────────────────────────────────

export const processNoiseFilterFiles = async (
  files: string[],
  counts: { noise: number; keep: number; error: number },
  options: { dryRun: boolean; report: boolean },
): Promise<void> => {
  const { dryRun, report } = options;

  for (const filePath of files) {
    const filename = normalizePath(filePath).split('/').pop()!;

    let text: string;
    try {
      text = await readTextFile(filePath);
    } catch (e) {
      logger.error(`  error (${filename}): ${e}`);
      counts.error++;
      continue;
    }

    const { isNoise, reason } = classifyFile(filename, text);

    if (isNoise) {
      counts.noise++;
      if (report) {
        logger.log(`NOISE\t${reason}\t${filePath}`);
      } else if (dryRun) {
        logger.log(filePath);
      } else {
        try {
          await Deno.remove(filePath);
          logger.info(`deleted: ${filePath}`);
        } catch (e) {
          logger.error(`  削除失敗: ${filename}: ${e}`);
          counts.error++;
          counts.noise--;
        }
      }
    } else {
      counts.keep++;
    }
  }
};
