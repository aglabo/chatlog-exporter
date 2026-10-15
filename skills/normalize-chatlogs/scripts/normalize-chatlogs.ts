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
import { ChatlogError } from '../../_cle-libs/classes/ChatlogError.class.ts';

// -- types --
import type { HashProvider } from '../../_cle-libs/types/providers.types.ts';

// -- constants --
import { isKnownAgent } from '../../_cle-libs/constants/agents.constants.ts';
import {
  DEFAULT_AGENT,
  DEFAULT_NORMALIZE_DIR,
  DEFAULT_ORIGINAL_LOGS_DIR,
} from '../../_cle-libs/constants/defaults.constants.ts';

// -- std --
import { resolve } from '@std/path';

// -- file-io --
import { resolveChatlogsDir, resolveOutputBase } from '../../_cle-libs/libs/file-io/resolve-directory.ts';
import { dirExistsSync, fileExists } from '../../_cle-libs/libs/file-ops/exists-utils.ts';

// -- io --
import { logger } from '../../_cle-libs/libs/io/logger.ts';

// -- path-utils --
import { getDirectory, normalizePath } from '../../_cle-libs/libs/path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// local modules
// ─────────────────────────────────────────────

// -- constants --
import { CHATLOG_MONTH_DIR_PATTERN, DEFAULT_NORMALIZE_CONFIG } from './constants/normalize.constants.ts';

// -- libs --
import { initStats, reportStats } from './libs/stats-utils.ts';

// -- modules --
import { buildConfig } from './modules/normalize-config.ts';
import { processFiles } from './modules/process-files.ts';

// -- types --
import type { NormalizeConfig } from './types/normalize.types.ts';

// ─── Input Resolution ─────────────────────────────────────────────────────────

/** Result of {@link _resolveInput}. `agent` / `period` are set only when `--file` sits in a month directory. */
type _ResolvedInput = { inputDir: string; inputFile?: string; agent?: string; period?: string };

/** A bare Windows drive (`C:`), which is not a usable input directory on its own. */
const _BARE_DRIVE_PATTERN = /^[A-Za-z]:$/;

/**
 * Validates the `<agent>/<yyyy>/<yyyy-mm>` tail captured by {@link CHATLOG_MONTH_DIR_PATTERN}.
 *
 * @param fileDir - Directory the tail was taken from (included in the error message)
 * @param agent   - Captured `<agent>`
 * @param year    - Captured `<yyyy>`
 * @param period  - Captured `<yyyy-mm>`
 * @throws ChatlogError(`InvalidPath`, `UnknownAgent`) when `agent` is not a known agent
 * @throws ChatlogError(`InvalidPath`, `YearMismatch`) when the year of `period` differs from `year`
 * @throws ChatlogError(`InvalidPath`, `InvalidMonth`) when the month of `period` is outside 01-12
 */
const _validateMonthDir = (fileDir: string, agent: string, year: string, period: string): void => {
  if (!isKnownAgent(agent)) {
    throw new ChatlogError('InvalidPath', 'UnknownAgent', `unknown agent '${agent}' in ${fileDir}`);
  }
  if (!period.startsWith(`${year}-`)) {
    throw new ChatlogError('InvalidPath', 'YearMismatch', `year '${year}' does not match '${period}' in ${fileDir}`);
  }
  const _month = Number(period.slice(-2));
  if (_month < 1 || _month > 12) {
    throw new ChatlogError('InvalidPath', 'InvalidMonth', `invalid month in '${period}' in ${fileDir}`);
  }
};

/**
 * Derives the input directory and the agent / period from a `--file` path's parent directory.
 *
 * When `fileDir` ends with `<agent>/<yyyy>/<yyyy-mm>` ({@link CHATLOG_MONTH_DIR_PATTERN}, the last occurrence
 * wins), the tail is validated by {@link _validateMonthDir}; `agent` and `period` (`<yyyy-mm>`) come from that
 * tail, and `inputDir` is the directory before `<agent>`.
 * When that base directory is empty or a bare drive, `inputDir` falls back to `fileDir`.
 * Without a tail match, `inputDir` is `fileDir` and no agent / period is returned.
 *
 * @param fileDir - Normalized absolute parent directory of the input file
 * @returns The input directory to scan/validate, plus the agent / period derived from the path
 * @throws ChatlogError(`InvalidPath`, `UnknownAgent` | `YearMismatch` | `InvalidMonth`) when the matched tail
 *   has an unknown agent, a year mismatch between `<yyyy>` and `<yyyy-mm>`, or a month outside 01-12
 */
const _resolveFromFileDir = (fileDir: string): Omit<_ResolvedInput, 'inputFile'> => {
  const _match = fileDir.match(CHATLOG_MONTH_DIR_PATTERN);
  if (!_match) {
    return { inputDir: fileDir };
  }
  const [, _baseDir, _agent, _year, _period] = _match;
  _validateMonthDir(fileDir, _agent, _year, _period);
  const _usable = _baseDir !== '' && !_BARE_DRIVE_PATTERN.test(_baseDir);
  return { inputDir: _usable ? _baseDir : fileDir, agent: _agent, period: _period };
};

/**
 * Resolves where the run reads its chatlogs from.
 *
 * - `--file` given: the file path is resolved to a normalized absolute path and must exist. `inputDir`,
 *   `agent` and `period` are derived from its parent directory by {@link _resolveFromFileDir}. The file and
 *   input directory are logged. `--input-dir` and positional directories are ignored (`--file` wins).
 * - otherwise: `resolveChatlogsDir` decides `inputDir`, which is logged and must exist.
 *
 * @param config - Built normalize config
 * @returns The input directory, plus the normalized input file and path-derived agent / period for `--file`
 * @throws ChatlogError(`InputNotFound`, `NotFound`) when the `--file` file or the input directory does not exist
 * @throws ChatlogError(`InvalidPath`, `UnknownAgent` | `YearMismatch` | `InvalidMonth`) when the `--file` parent
 *   directory ends with an invalid `<agent>/<yyyy>/<yyyy-mm>` tail (see {@link _resolveFromFileDir})
 */
const _resolveInput = async (config: NormalizeConfig): Promise<_ResolvedInput> => {
  if (config.inputFile) {
    const _inputFile = normalizePath(resolve(config.inputFile));
    if (!(await fileExists(_inputFile))) {
      throw new ChatlogError('InputNotFound', 'NotFound', `file not found: ${_inputFile}`);
    }
    const _resolved = _resolveFromFileDir(getDirectory(_inputFile));
    logger.info(`入力ファイル: ${_inputFile}`);
    logger.info(`入力ディレクトリ: ${_resolved.inputDir}`);
    return { ..._resolved, inputFile: _inputFile };
  }
  const _inputDir = resolveChatlogsDir({
    chatlogsDir: config.chatlogsDir,
    agent: config.agent ?? DEFAULT_AGENT,
    period: config.period,
    addOnDir: DEFAULT_ORIGINAL_LOGS_DIR,
    override: config.inputDir,
  });
  logger.info(`入力ディレクトリ: ${_inputDir}`);
  if (!dirExistsSync(_inputDir)) {
    throw new ChatlogError('InputNotFound', 'NotFound', `directory not found: ${_inputDir}`);
  }
  return { inputDir: _inputDir };
};

/**
 * Resolves the output base directory.
 *
 * The path-derived `agent` / `period` of `--file` override the config / CLI values; `--output-dir` always wins.
 * In `--file` mode the result is a normalized absolute path, so the input/output containment check compares
 * two absolute paths. Otherwise the result is returned as `resolveOutputBase` builds it.
 *
 * @param config - Built normalize config
 * @param input  - Result of {@link _resolveInput}
 * @returns The output base directory
 */
const _resolveOutput = (config: NormalizeConfig, input: _ResolvedInput): string => {
  const _outputBase = resolveOutputBase({
    chatlogsDir: config.chatlogsDir,
    agent: input.agent ?? config.agent ?? DEFAULT_AGENT,
    period: input.period ?? config.period,
    addOnDir: DEFAULT_NORMALIZE_DIR,
    outputDir: config.outputDir,
  });
  return input.inputFile ? normalizePath(resolve(_outputBase)) : _outputBase;
};

// ─── Main Orchestration ───────────────────────────────────────────────────────

/**
 * Orchestrates the full normalize-chatlogs pipeline.
 *
 * Flow: parseArgs → {@link _resolveInput} (`--file` → that file and {@link _resolveFromFileDir};
 *   otherwise resolveChatlogsDir) → {@link _resolveOutput} → findFiles (skipped for `--file`) →
 *   withConcurrency(per-file: segmentChatlogs → generateSegmentFile + attachFrontmatter + writeTextFile) →
 *   reportStats
 *
 * @param argv   - CLI argument array; defaults to `Deno.args` when omitted
 * @param hashFn - Optional hash generator for output file names (injectable for testing)
 * @returns Process exit code (`0` on success). Errors are thrown, never handled with `Deno.exit()`
 */
export const main = async (argv?: string[], hashFn?: HashProvider): Promise<number> => {
  const config = buildConfig(argv ?? Deno.args, DEFAULT_NORMALIZE_CONFIG);
  const _input = await _resolveInput(config);
  const { inputDir, inputFile } = _input;
  const outputBase = _resolveOutput(config, _input);
  logger.info(`出力ディレクトリ: ${outputBase}`);
  const stats = initStats();
  await processFiles(inputDir, outputBase, inputFile ? { ...config, inputFile } : config, stats, hashFn);
  reportStats(stats);
  return 0;
};

if (import.meta.main) {
  try {
    Deno.exit(await main());
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
