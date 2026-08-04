// src: skills/normalize-chatlogs/scripts/phases/phase-load.ts
// @(#): pendingFiles 読み込みフェーズ
//       対象: phaseLoad
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── Shared scripts
// constants
import { LOGGER_TEXT } from '../../../_cle-libs/constants/logger.constants.ts';
// functions
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { getBasename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';

// ─── Local
import { loadEntries } from '../libs/load-entries.ts';
// types
import type { LoadEntryFailure } from '../types/load-entry.types.ts';
import type { NormalizeConfig } from '../types/normalize.types.ts';

/**
 * Loads `pendingFiles` into `ChatlogEntry` objects, logging load failures.
 *
 * Failures are collected into `errors`; the caller is responsible for accumulating
 * `stats.error` from `errors.length`. When `config.failFast` is true and at least one
 * load failure occurred, throws `ChatlogError('FailFast', 'LoadFailed', ...)` referencing
 * the first failed file.
 *
 * @param pendingFiles - File paths to load
 * @param config       - Processing config (failFast)
 * @param concurrency  - Parallelism forwarded to `loadEntries`
 * @returns Successfully loaded entries and load failures
 */
export const phaseLoad = async (
  pendingFiles: string[],
  config: Pick<NormalizeConfig, 'failFast'>,
  concurrency: number,
): Promise<{ entries: ChatlogEntry[]; errors: LoadEntryFailure[] }> => {
  const { entries, errors } = await loadEntries(pendingFiles, concurrency);

  for (const { filePath, error } of errors) {
    logger.warn(`${LOGGER_TEXT.INDENT}failed (load error: ${error.message}): ${getBasename(filePath)}`);
  }

  if (config.failFast && errors.length > 0) {
    throw new ChatlogError('FailFast', 'LoadFailed', `fail-fast triggered by: ${getBasename(errors[0].filePath)}`);
  }

  return { entries, errors };
};
