// src: scripts/modules/filter/process-chunk.ts
// @(#): チャンク単位の Claude 判定とファイル削除
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── shared ───
// classes
import type { ChatlogCache } from '../../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
// functions
import { runAI } from '../../../../_cle-libs/libs/ai/run-ai.ts';
import { logger } from '../../../../_cle-libs/libs/io/logger.ts';
import { parseAiJsonArray } from '../../../../_cle-libs/libs/text/json-utils.ts';
// constants
import { LOGGER_TEXT } from '../../../../_cle-libs/constants/logger.constants.ts';
// types
import type { ChatlogEntry } from '../../../../_cle-libs/classes/ChatlogEntry.class.ts';

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
  chunkEntries: ChatlogEntry[],
  stats: FilterStats,
  discardThreshold: number,
  cache: ChatlogCache<CLEResult>,
  ctl: AbortController,
  model?: string,
): Promise<ChatlogError | undefined> => {
  const batchPrompt = buildBatchPrompt(chunkEntries);

  let rawResult: string;
  try {
    rawResult = await runAI(_SYSTEM_PROMPT, batchPrompt, { ...(model ? { model } : {}), signal: ctl.signal });
  } catch (e) {
    if (!(e instanceof ChatlogError)) { throw e; }
    logger.warn(`${LOGGER_TEXT.INDENT}claude CLI 実行失敗。チャンク内ファイルをすべて error 扱い`);
    logger.warn(`${LOGGER_TEXT.INDENT}error: ${e.message}`);
    chunkEntries.forEach((entry) => logger.warn(`${LOGGER_TEXT.INDENT}error扱い: ${entry.filename}`));
    stats.error += chunkEntries.length;
    if (e.subindex === 'RateLimit') { ctl.abort(); }
    return e;
  }

  const parsed = parseAiJsonArray<ClaudeResult>(rawResult);
  if (!parsed) {
    logger.warn(`${LOGGER_TEXT.INDENT}JSON パース失敗。チャンク内ファイルをすべて error 扱い`);
    logger.warn(`${LOGGER_TEXT.INDENT}raw output: ${rawResult.slice(0, 200)}`);
    chunkEntries.forEach((entry) => logger.warn(`${LOGGER_TEXT.INDENT}error扱い: ${entry.filename}`));
    stats.error += chunkEntries.length;
    return new ChatlogError('InvalidFormat', 'JsonParse', `raw output: ${rawResult.slice(0, 200)}`);
  }

  for (const entry of chunkEntries) {
    const { filename } = entry;
    const result = parsed.find((r) => r.file === filename);

    if (!result) {
      logger.info(`${LOGGER_TEXT.INDENT}判定不能: ${filename} - skipped`);
      stats.skip++;
      continue;
    }

    const { decision, confidence, reason } = result;
    const isConfirmedDiscard = decision === FILTER_DECISIONS.DISCARD && confidence >= discardThreshold;
    const isGreyZoneDiscard = decision === FILTER_DECISIONS.DISCARD && confidence < discardThreshold;

    if (isConfirmedDiscard) {
      await cache.write(entry.filePath as string, { decision: FILTER_DECISIONS.DISCARD, confidence, reason });
      logger.info(`${LOGGER_TEXT.INDENT}discard confirmed (conf=${confidence}): ${filename}`);
      logger.info(`${LOGGER_TEXT.INDENT}reason: ${reason}`);
    } else if (isGreyZoneDiscard) {
      await cache.write(entry.filePath as string, { decision: FILTER_DECISIONS.EMPTY, confidence, reason });
      logger.info(`${LOGGER_TEXT.INDENT}閾値未満 (decision=${decision}, conf=${confidence}): ${filename} - skipped`);
      stats.skip++;
    } else {
      await cache.write(entry.filePath as string, { decision: FILTER_DECISIONS.KEEP, confidence, reason });
      logger.info(`${LOGGER_TEXT.INDENT}kept (decision=${decision}, conf=${confidence}): ${filename}`);
      stats.keep++;
    }
  }

  return undefined;
};
