// src: scripts/phases/phase-type-category.ts
// @(#): type・category 同時判定フェーズ（Phase 2.1）
//       対象: phaseTypeAndCategory
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
import { runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { judgeTypeAndCategory } from '../modules/setfm-type-category.ts';
import type { SetfmConfig } from '../types/args.types.ts';
import { SETFM_CACHE_STATUSES } from '../types/cache.const.type.ts';
import type { SetfmCacheStatus } from '../types/cache.const.type.ts';
import type { SetfmCache } from '../types/cache.types.ts';
import type { Dics, Prompts } from '../types/dics.types.ts';

// ─── Internal types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  model?: string,
  signal?: AbortSignal,
) => Promise<void>;

/** このフェーズが処理対象とする cache.status の集合。これ以外（frontmatter/reviewed/written）は対象外。 */
const _TARGET_STATUSES: readonly (SetfmCacheStatus | undefined)[] = [
  undefined,
  SETFM_CACHE_STATUSES.EMPTY,
  SETFM_CACHE_STATUSES.REVIEW_FAILED,
  SETFM_CACHE_STATUSES.TYPE_CATEGORY,
];

/**
 * このフェーズが type/category を処理すべき対象エントリかを cache.status から純粋判定する。
 *
 * cache.status が `{undefined, empty, review-failed, type-category}` のいずれかのとき `true` を返す。
 * `frontmatter` / `reviewed` / `written` のエントリは後続フェーズ済みのため対象外（`false`）。
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @returns このフェーズの処理対象なら `true`
 */
export const isTypeCategoryTarget = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): boolean => _TARGET_STATUSES.includes(cache.read(entry.filePath!).status);

/** cache 優先で解決した type/category を返す（cache になければ entry.frontmatter を参照）。 */
const _resolveTypeCategory = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): { type?: string; category?: string } => {
  const _cached = cache.read(entry.filePath!);
  return {
    type: _cached.type ?? (entry.frontmatter.get('type') as string | undefined),
    category: _cached.category ?? (entry.frontmatter.get('category') as string | undefined),
  };
};

/**
 * type/category を AI 判定する必要があるかを entry と cache から純粋判定する。
 *
 * type/category のソースは cache 優先（cache にあれば cache、なければ entry.frontmatter）で解決し、
 * 次のいずれかを満たすとき `true`（AI 判定が必要）を返す。
 * - cache.status が `REVIEW_FAILED`（review 失敗は必ず再判定）
 * - 解決後の type または category が欠けている
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @returns AI 判定が必要なら `true`
 */
export const needsTypeCategoryAi = (
  entry: ChatlogEntry,
  cache: ChatlogCache<SetfmCache>,
): boolean => {
  const _status = cache.read(entry.filePath!).status;
  const { type, category } = _resolveTypeCategory(entry, cache);
  return _status === SETFM_CACHE_STATUSES.REVIEW_FAILED || !(type && category);
};

export const phaseTypeAndCategory = async (
  entries: ChatlogEntry[],
  cache: ChatlogCache<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  config: Pick<SetfmConfig, 'concurrency' | 'dryRun' | 'model'>,
  judgeProvider?: _JudgeProvider,
): Promise<void> => {
  const _targets = entries.filter((e) => isTypeCategoryTarget(e, cache));
  const _judge = judgeProvider ?? judgeTypeAndCategory;

  await runConcurrent(
    _targets,
    async (entry, ctl) => {
      const _fp = entry.filePath!;
      const _needsAi = needsTypeCategoryAi(entry, cache);

      if (config.dryRun) {
        const _label = _needsAi
          ? `type/category: ${getFilename(_fp)}`
          : `type+category (existing): ${getFilename(_fp)}`;
        logger.dryrun(`${LOGGER_TEXT.INDENT}${_label}`);
        return;
      }

      if (!_needsAi) {
        const { type, category } = _resolveTypeCategory(entry, cache);
        entry.frontmatter.set('type', type!);
        entry.frontmatter.set('category', category!);
        // status の昇格は未着手（empty/undefined）のときのみ。type-category 等は降格防止で据え置く。
        const _status = cache.read(_fp).status;
        if (_status === undefined || _status === SETFM_CACHE_STATUSES.EMPTY) {
          await cache.write(_fp, { type: type!, category: category!, status: SETFM_CACHE_STATUSES.TYPE_CATEGORY });
        }
        logger.info(`${LOGGER_TEXT.INDENT}type+category (existing): ${getFilename(_fp)}`);
        return;
      }

      await _judge(entry, maxContentLength, dics, prompts, config.model, ctl.signal);
      const _type = entry.frontmatter.get('type') as string;
      const _category = entry.frontmatter.get('category') as string;
      if (_type && _category) {
        await cache.write(_fp, { type: _type, category: _category, status: SETFM_CACHE_STATUSES.TYPE_CATEGORY });
      } else {
        await cache.delete(_fp);
      }
      logger.info(
        `${LOGGER_TEXT.INDENT}type [${entry.frontmatter.get('type')}] category [${
          entry.frontmatter.get('category')
        }]: ${getFilename(_fp)}`,
      );
    },
    config.concurrency,
  );
};
