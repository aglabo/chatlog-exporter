// src: scripts/modules/filter/process-chunk.ts
// @(#): チャンク単位の Claude 判定とファイル削除
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import type { ChatlogCache } from '../../../../_scripts/classes/ChatlogCache.class.ts';
// functions
import { runAI } from '../../../../_scripts/libs/ai/run-ai.ts';
import { removeFile } from '../../../../_scripts/libs/file-ops/remove-utils.ts';
import { logger } from '../../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../../_scripts/libs/path-utils/path-utils.ts';
import { parseAiJsonArray } from '../../../../_scripts/libs/text/json-utils.ts';

// ─── internal ───
// functions
import { buildBatchPrompt } from '../../libs/batch-prompt.ts';
import { FILTER_DECISIONS } from '../../types/filter-decision.const.types.ts';
// types
import type { CLEResult } from '../../types/cache.types.ts';
import type { ClaudeResult } from '../../types/filter.types.ts';
import type { FilterStats } from '../../types/stats.types.ts';

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** Claude CLI に渡すシステムプロンプト。filter-chatlogs スキル固有。 */
const _SYSTEM_PROMPT = `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","decision":"KEEP or DISCARD","confidence":0.0,"reason":"..."},...]

KEEP: design decisions, reusable patterns, new concepts, architecture discussion
DISCARD: execution-only, trivial Q&A, no reusable insight, context-dependent`;

// ─────────────────────────────────────────────
// チャンク処理
// ─────────────────────────────────────────────

export const processChunk = async (
  chunkFiles: string[],
  stats: FilterStats,
  discardThreshold: number,
  cache: ChatlogCache<CLEResult>,
): Promise<void> => {
  const batchPrompt = await buildBatchPrompt(chunkFiles);

  let rawResult: string;
  try {
    rawResult = await runAI(_SYSTEM_PROMPT, batchPrompt);
  } catch (e) {
    logger.warn(`  claude CLI 実行失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  error: ${e}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (claude error): ${getFilename(f)}`);
      stats.keep++;
    }
    return;
  }

  const parsed = parseAiJsonArray<ClaudeResult>(rawResult);
  if (!parsed) {
    logger.warn(`  JSON パース失敗。チャンク内ファイルをすべて KEEP 扱い`);
    logger.warn(`  raw output: ${rawResult.slice(0, 200)}`);
    for (const f of chunkFiles) {
      logger.info(`  kept (parse error): ${getFilename(f)}`);
      stats.keep++;
    }
    return;
  }

  for (const filePath of chunkFiles) {
    const filename = getFilename(filePath);
    const result = parsed.find((r) => r.file === filename);

    if (!result) {
      logger.info(`  kept (not in result): ${filename}`);
      stats.keep++;
      continue;
    }

    const { decision, confidence, reason } = result;
    await cache.write(filePath, { decision, confidence, reason });

    if (decision === FILTER_DECISIONS.DISCARD && confidence >= discardThreshold) {
      logger.log(`DISCARD (conf=${confidence}): ${filePath}`);
      logger.info(`  reason: ${reason}`);
      if (await removeFile(filePath)) {
        stats.remove++;
      } else {
        logger.warn(`  skip (File not found):${filePath}`);
        stats.error++;
      }
    } else {
      logger.info(`  kept (decision=${decision}, conf=${confidence}): ${filename}`);
      stats.keep++;
    }
  }
};
