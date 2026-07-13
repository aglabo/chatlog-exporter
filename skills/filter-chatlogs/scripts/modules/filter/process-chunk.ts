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
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
// functions
import { runAI } from '../../../../_scripts/libs/ai/run-ai.ts';
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
  ctl: AbortController,
): Promise<ChatlogError | undefined> => {
  if (ctl.signal.aborted) {
    logger.warn(`  レートリミット中のためスキップ。チャンク内ファイルをすべて error 扱い`);
    stats.error += chunkFiles.length;
    return;
  }

  const batchPrompt = await buildBatchPrompt(chunkFiles);

  let rawResult: string;
  try {
    rawResult = await runAI(_SYSTEM_PROMPT, batchPrompt);
  } catch (e) {
    if (!(e instanceof ChatlogError)) { throw e; }
    logger.warn(`  claude CLI 実行失敗。チャンク内ファイルをすべて error 扱い`);
    logger.warn(`  error: ${e.message}`);
    stats.error += chunkFiles.length;
    if (e.subindex === 'RateLimit') { ctl.abort(); }
    return e;
  }

  const parsed = parseAiJsonArray<ClaudeResult>(rawResult);
  if (!parsed) {
    logger.warn(`  JSON パース失敗。チャンク内ファイルをすべて error 扱い`);
    logger.warn(`  raw output: ${rawResult.slice(0, 200)}`);
    stats.error += chunkFiles.length;
    return new ChatlogError('InvalidFormat', 'JsonParse', `raw output: ${rawResult.slice(0, 200)}`);
  }

  for (const filePath of chunkFiles) {
    const filename = getFilename(filePath);
    const result = parsed.find((r) => r.file === filename);

    if (!result) {
      logger.info(`  判定不能: ${filename} - skipped`);
      stats.skip++;
      continue;
    }

    const { decision, confidence, reason } = result;
    const isConfirmedDiscard = decision === FILTER_DECISIONS.DISCARD && confidence >= discardThreshold;
    const isGreyZoneDiscard = decision === FILTER_DECISIONS.DISCARD && confidence < discardThreshold;

    if (isConfirmedDiscard) {
      await cache.write(filePath, { decision: FILTER_DECISIONS.DISCARD, confidence, reason });
      logger.info(`  discard confirmed (conf=${confidence}): ${filename}`);
      logger.info(`  reason: ${reason}`);
    } else if (isGreyZoneDiscard) {
      await cache.write(filePath, { decision: FILTER_DECISIONS.EMPTY, confidence, reason });
      logger.info(`  閾値未満 (decision=${decision}, conf=${confidence}): ${filename} - skipped`);
      stats.skip++;
    } else {
      await cache.write(filePath, { decision: FILTER_DECISIONS.KEEP, confidence, reason });
      logger.info(`  kept (decision=${decision}, conf=${confidence}): ${filename}`);
      stats.keep++;
    }
  }

  return undefined;
};
