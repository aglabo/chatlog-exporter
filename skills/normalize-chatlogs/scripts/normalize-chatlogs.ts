// src: scripts/normalize-chatlogs.ts
// @(#): チャットログを AI でトピック別セグメントに分割し、フロントマター付き Markdown として出力する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─────────────────────────────────────────────
// shared modules
// ─────────────────────────────────────────────

// -- classes --
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';

// -- types --
import type { HashProvider } from '../../_scripts/types/providers.types.ts';

// -- constants --
import {
  DEFAULT_AGENT,
  DEFAULT_CHATLOGS_DIR,
  DEFAULT_NORMALIZE_DIR,
  DEFAULT_TIMEOUT_MS,
} from '../../_scripts/constants/defaults.constants.ts';

// -- file-io --
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExistsSync } from '../../_scripts/libs/file-ops/exists-utils.ts';

// -- io --
import { logger } from '../../_scripts/libs/io/logger.ts';

// ─────────────────────────────────────────────
// local modules
// ─────────────────────────────────────────────

// -- constants --
import { DEFAULT_NORMALIZE_CONFIG } from './constants/normalize.constants.ts';

// -- modules --
import { reportResults } from './modules/file-io.ts';
import { buildConfig, parseArgs } from './modules/normalize-config.ts';
import { processFiles } from './modules/process-files.ts';

// -- local types --
import type { Stats } from './types/normalize.types.ts';

// ─── Main Orchestration ───────────────────────────────────────────────────────

/**
 * Orchestrates the full normalize-chatlogs pipeline.
 *
 * Flow: parseArgs → resolveChatlogsDir → findFiles → withConcurrency(per-file:
 *   segmentChatlogs → generateSegmentFile + attachFrontmatter + writeOutput) → reportResults
 *
 * @param argv   - CLI argument array; defaults to `Deno.args` when omitted
 * @param hashFn - Optional hash generator for output file names (injectable for testing)
 */
export const main = async (argv?: string[], hashFn?: HashProvider): Promise<void> => {
  try {
    const _parsed = parseArgs(argv ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _timeoutMs = Number(_globalConfig.get('timeoutMs') ?? DEFAULT_TIMEOUT_MS);
    const config = buildConfig(_parsed, {
      ...DEFAULT_NORMALIZE_CONFIG,
      timeoutMs: _timeoutMs,
    });
    const inputDir = resolveChatlogsDir({
      chatlogsDir: config.chatlogsDir,
      baseDir: config.baseDir ?? DEFAULT_CHATLOGS_DIR,
      agent: config.agent ?? DEFAULT_AGENT,
      period: config.period,
    });
    if (!dirExistsSync(inputDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `directory not found: ${inputDir}`);
    }
    const outputBase = config.normalizeDir ?? DEFAULT_NORMALIZE_DIR;

    const stats: Stats = { success: 0, skip: 0, fail: 0 };
    await processFiles(inputDir, outputBase, config, stats, hashFn);
    reportResults(stats);
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) {
  await main();
}
