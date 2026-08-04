// src: scripts/phases/phase-write.ts
// @(#): 書き込み判定・Markdown書き込みフェーズ（Phase 4.1）
//       対象: filterWriteEntry, phaseWrite
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── Shared scripts
import { ChatlogCache } from '../../../_cle-libs/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { LOGGER_TEXT } from '../../../_cle-libs/constants/logger.constants.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { getFilename } from '../../../_cle-libs/libs/path-utils/path-utils.ts';
// ─── Local
import { applyCacheToEntry, writeFrontmatter } from '../modules/setfm-write.ts';
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Stats } from '../types/phase.types.ts';

// ─── Internal types
type _WriteProvider = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
  outputDir: string,
  inputDir: string,
) => Promise<boolean>;

/**
 * エントリが書き込み対象かどうかを status で判定する predicate 関数。
 *
 * `review=true` の場合は `status === 'reviewed'` のみ true を返す。
 * `review=false` の場合は `status === 'reviewed'` または `status === 'frontmatter'` で true を返す。
 * `status === 'written'` / `status === 'review-failed'` / `status === ''` は常に false。
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @param review - true の場合は 'reviewed' のみ、false の場合は 'reviewed' と 'frontmatter' の両方
 * @returns 書き込み対象なら true
 */
export const filterWriteEntry = (
  filePath: string,
  cache: ChatlogCache<SetfmCache>,
  review: boolean,
): boolean => {
  const status = cache.read(filePath).status;
  if (review) {
    return status === SETFM_CACHE_STATUSES.REVIEWED;
  } else {
    return status === SETFM_CACHE_STATUSES.REVIEWED || status === SETFM_CACHE_STATUSES.FRONTMATTER;
  }
};

export const phaseWrite = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  config: { outputDir: string; inputDir: string; dryRun: boolean },
  stats: Stats,
  writeProvider?: _WriteProvider,
): Promise<void> => {
  logger.info(`\nPhase 4.1: Markdownへ書き込み (${entries.length}件)`);
  const _write = writeProvider ?? writeFrontmatter;
  // NOTE: for...of is intentional here — writes must be sequential to preserve existing behavior
  for (const entry of entries) {
    applyCacheToEntry(entry, cache.read(entry.filePath!));
    if (config.dryRun) {
      const _type = (entry.frontmatter.get('type') as string) ?? '';
      const _category = (entry.frontmatter.get('category') as string) ?? '';
      logger.dryrun(`${LOGGER_TEXT.INDENT}[${_type}/${_category}]: ${getFilename(entry.filePath!)} -- skipped`);
      stats.skip++;
    } else {
      const _ok = await _write(entry, cache, config.outputDir, config.inputDir);
      if (_ok) {
        logger.info(`${LOGGER_TEXT.INDENT}OK: ${getFilename(entry.filePath!)}`);
        stats.success++;
      } else {
        stats.fail++;
      }
    }
  }
};
