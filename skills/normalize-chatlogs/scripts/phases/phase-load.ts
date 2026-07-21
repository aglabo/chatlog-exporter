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
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
// functions
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getBasename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// classes
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';

// ─── Local
import { loadEntries } from '../libs/load-entries.ts';
// types
import type { LoadEntryFailure } from '../types/load-entry.types.ts';
import type { NormalizeConfig, Stats } from '../types/normalize.types.ts';

/**
 * Loads `pendingFiles` into `ChatlogEntry` objects, logging and counting load failures.
 *
 * Failures are collected into `errors` and each increments `stats.fail`. When
 * `config.failFast` is true and at least one load failure occurred, throws
 * `ChatlogError('FailFast', 'LoadFailed', ...)` referencing the first failed file.
 *
 * @param pendingFiles - File paths to load
 * @param concurrency  - Parallelism forwarded to `loadEntries`
 * @param config       - Processing config (failFast)
 * @param stats        - Mutable counters updated in place
 * @returns Successfully loaded entries and load failures
 */
export const phaseLoad = async (
  pendingFiles: string[],
  concurrency: number,
  config: Pick<NormalizeConfig, 'failFast'>,
  stats: Stats,
): Promise<{ entries: ChatlogEntry[]; errors: LoadEntryFailure[] }> => {
  const { entries, errors } = await loadEntries(pendingFiles, concurrency);

  for (const { filePath, error } of errors) {
    logger.warn(`${LOGGER_TEXT.INDENT}failed (load error: ${error.message}): ${getBasename(filePath)}`);
  }
  stats.fail += errors.length;

  if (config.failFast && errors.length > 0) {
    throw new ChatlogError('FailFast', 'LoadFailed', `fail-fast triggered by: ${getBasename(errors[0].filePath)}`);
  }

  return { entries, errors };
};
