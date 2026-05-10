// src: scripts/libs/process-chunk.ts
// @(#): チャンク単位の Claude 判定とファイル削除
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── external ───
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { removeFile } from '../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { parseJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// ─── internal ───
import type { ClaudeResult, Stats } from '../types/filter.types.ts';
import { buildBatchPrompt } from './batch-prompt.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** Claude CLI に渡すシステムプロンプト。filter-chatlog スキル固有。 */
const _SYSTEM_PROMPT = `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","decision":"KEEP or DISCARD","confidence":0.0,"reason":"..."},...]

KEEP: design decisions, reusable patterns, new concepts, architecture discussion
DISCARD: execution-only, trivial Q&A, no reusable insight, context-dependent`;

// ─────────────────────────────────────────────
// チャンク処理
// ─────────────────────────────────────────────

export const processChunk = async (
  chunkFiles: string[],
  dryRun: boolean,
  stats: Stats,
  discardThreshold: number,
): Promise<void> => {
  const batchPrompt = await buildBatchPrompt(chunkFiles);

  let rawResult: string;
  try {
    rawResult = await runAI(_SYSTEM_PROMPT, batchPrompt);
  } catch (e) {
    logger.warn(`  claude CLI 実行失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  error: ${e}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (claude error): ${f.split(/[/\\]/).pop()}`);
      stats.kept++;
    }
    return;
  }

  const parsed = parseJsonArray<ClaudeResult>(rawResult);
  if (!parsed) {
    logger.warn(`  JSON パース失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  raw output: ${rawResult.slice(0, 200)}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (parse error): ${f.split(/[/\\]/).pop()}`);
      stats.kept++;
    }
    return;
  }

  for (const filePath of chunkFiles) {
    const filename = filePath.split(/[/\\]/).pop()!;
    const result = parsed.find((r) => r.file === filename);

    if (!result) {
      logger.info(`  kept (not in result): ${filename}`);
      stats.kept++;
      continue;
    }

    const { decision, confidence, reason } = result;

    if (decision === 'DISCARD' && confidence >= discardThreshold) {
      if (dryRun) {
        logger.log(`[dry-run] DISCARD (conf=${confidence}): ${filePath}`);
        logger.info(`  reason: ${reason}`);
        stats.discarded++;
      } else {
        logger.log(`DISCARD (conf=${confidence}): ${filePath}`);
        logger.info(`  reason: ${reason}`);
        if (await removeFile(filePath)) {
          stats.discarded++;
        } else {
          logger.warn(`  skip (File not found):${filePath}`);
        }
      }
    } else {
      logger.info(`  kept (decision=${decision}, conf=${confidence}): ${filename}`);
      stats.kept++;
    }
  }
};
