// src: scripts/phases/phase-status.ts
// @(#): キャッシュステータス設定フェーズ（Phase 2.3）
//       対象: phaseStatus
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';

/**
 * エントリ配列を走査し、各エントリのキャッシュ status を設定する。
 *
 * - `cache.read(e.filePath!).status === 'written'` → スキップ
 * - `entry.frontmatter.hasRequiredFields() === true` → `status: 'frontmatter'` を書き込む
 * - それ以外 → `status: ''` を書き込む
 * - `dryRun === true` の場合は cache.write を実行しない
 *
 * @param entries - 対象エントリ配列
 * @param cache - フェーズキャッシュ
 * @param dryRun - true の場合は cache.write を実行しない
 */
export const phaseStatus = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  dryRun: boolean,
): Promise<void> => {
  await Promise.all(
    entries.map(async (entry) => {
      const _existing = cache.read(entry.filePath!);
      if (_existing.status === SETFM_CACHE_STATUSES.WRITTEN) {
        return;
      }
      if (dryRun) {
        logger.dryrun(`${LOGGER_TEXT.INDENT}status: ${getFilename(entry.filePath!)} - skipped`);
        return;
      }
      const _status = entry.frontmatter.hasRequiredFields()
        ? SETFM_CACHE_STATUSES.FRONTMATTER
        : SETFM_CACHE_STATUSES.EMPTY;
      await cache.write(entry.filePath!, { ..._existing, status: _status });
      logger.info(`${LOGGER_TEXT.INDENT}status: ${getFilename(entry.filePath!)} - status: ${_status || '(empty)'}`);
    }),
  );
};
