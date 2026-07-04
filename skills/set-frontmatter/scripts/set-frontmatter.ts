#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write --allow-env
// src: scripts/set-frontmatter.ts
// @(#): チャットログMarkdownにAI生成フロントマターを並列付加する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * set_frontmatter.ts — チャットログMarkdownにAI生成フロントマターを並列付加する
 *
 * 使い方:
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts --output-dir <dir> [--dry-run] [--review] [--dics DIR] [--config FILE]
 *
 * 処理フロー:
 *   Phase 1: ファイル列挙・メタ読み込み
 *   Phase 2+3a: type・category同時判定 (並列, 1回のAI呼び出し)
 *   Phase 3b: フロントマター生成 (並列, category起点)
 *   Phase 3.5: レビュー・修正 (並列)
 *   Phase 4: Markdownへ書き込み
 */

// cspell:words dics setfm

// ─── Shared scripts
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { ChatlogEntry } from '../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../_scripts/classes/ChatlogWorks.class.ts';
import { loadDics, loadPrompts } from './modules/setfm-assets-loader.ts';
// types
import { CACHE_STATUSES } from '../../_scripts/types/cache-status.const.types.ts';
import { buildConfig, parseArgs } from './modules/setfm-config.ts';
import { loadAllEntries } from './modules/setfm-entry-loader.ts';
import { generateFrontmatter } from './modules/setfm-frontmatter.ts';
import { reviewFrontmatter } from './modules/setfm-review.ts';
import { judgeTypeAndCategory } from './modules/setfm-type-category.ts';
import { applyCacheToEntry, hasFrontmatterFields, writeFrontmatter } from './modules/setfm-write.ts';
import type { SetfmCache } from './types/cache.types.ts';
import type { Dics, Prompts } from './types/dics.types.ts';
// types
import type { ReviewResult, Stats } from './types/phase.types.ts';

// ─── Internal types
type _JudgeProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
) => Promise<void>;

type _GenerateProvider = (
  entry: ChatlogEntry,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
) => Promise<boolean>;

type _ReviewProvider = (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
  maxRetry: number,
) => Promise<ReviewResult>;

type _WriteProvider = (
  entry: ChatlogEntry,
  cache: ChatlogWorks<SetfmCache>,
  outputDir: string,
  inputDir: string,
) => Promise<boolean>;

// ─── Internal constants
const _knownFields = ['title', 'date', 'session_id', 'project', 'slug', 'summary', 'topics', 'tags'];

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * エントリ配列を writtenEntries と targetEntries に分割する。
 *
 * `cache.read(e.filePath!).status === 'written'` のエントリを writtenEntries に、
 * それ以外を targetEntries に分類する。
 *
 * @param entries - 分割対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @returns `{ writtenEntries, targetEntries }` — 重複なし・漏れなしで分割されたエントリ配列
 */
const _splitWritten = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): { writtenEntries: ChatlogEntry[]; targetEntries: ChatlogEntry[] } => {
  const writtenEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.WRITTEN);
  const targetEntries = entries.filter((e) => cache.read(e.filePath!).status !== CACHE_STATUSES.WRITTEN);
  return { writtenEntries, targetEntries };
};

/**
 * エントリ配列を skipEntries と targetEntries に分割する。
 *
 * `cache.read(e.filePath!).status` が `'reviewed'` または `'need-review'` のエントリを skipEntries に、
 * それ以外を targetEntries に分類する。
 *
 * @param entries - 分割対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @returns `{ skipEntries, targetEntries }` — 重複なし・漏れなしで分割されたエントリ配列
 */
const _splitSkip = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): { skipEntries: ChatlogEntry[]; targetEntries: ChatlogEntry[] } => {
  const _isSkipStatus = (e: ChatlogEntry): boolean => {
    const status = cache.read(e.filePath!).status;
    return status === CACHE_STATUSES.REVIEWED || status === CACHE_STATUSES.NEED_REVIEW;
  };
  return {
    skipEntries: entries.filter(_isSkipStatus),
    targetEntries: entries.filter((e) => !_isSkipStatus(e)),
  };
};

const _phaseTypeAndCategory = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  judgeProvider?: _JudgeProvider,
): Promise<void> => {
  const _hits = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return !!(_cached.type && _cached.category);
  });
  const _misses = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return !(_cached.type && _cached.category);
  });

  _hits.forEach((e) => {
    const _cached = cache.read(e.filePath!);
    e.frontmatter.set('type', _cached.type!);
    e.frontmatter.set('category', _cached.category!);
    logger.info(`  type+category (cached): ${getFilename(e.filePath!)}`);
  });

  const _judge = judgeProvider ?? judgeTypeAndCategory;
  await runConcurrent(
    _misses,
    async (entry) => {
      if (dryRun) {
        logger.info(`  [dry-run] type/category: ${getFilename(entry.filePath!)}`);
      } else {
        await _judge(entry, maxContentLength, dics, prompts);
        await cache.write(entry.filePath!, {
          type: entry.frontmatter.get('type') as string,
          category: entry.frontmatter.get('category') as string,
        });
        logger.info(
          `  type [${entry.frontmatter.get('type')}] category [${entry.frontmatter.get('category')}]: ${
            getFilename(entry.filePath!)
          }`,
        );
      }
    },
    concurrency,
  );
};

const _phaseFrontmatter = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  generateProvider?: _GenerateProvider,
  maxRetry = 0,
): Promise<Set<string>> => {
  const _generatedFiles = new Set<string>();

  const _hits = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return !!_cached.frontmatter && _cached.status !== CACHE_STATUSES.REVIEW_FAILED;
  });
  const _misses = entries.filter((e) => {
    const _cached = cache.read(e.filePath!);
    return !_cached.frontmatter || _cached.status === CACHE_STATUSES.REVIEW_FAILED;
  });

  for (const e of _hits) {
    const _cached = cache.read(e.filePath!);
    Object.entries(_cached.frontmatter!).forEach(([k, v]) => e.frontmatter.set(k, v));
    _generatedFiles.add(e.filePath!);
    if (hasFrontmatterFields(e) && !dryRun) {
      await cache.write(e.filePath!, { ..._cached, status: CACHE_STATUSES.NEED_REVIEW });
    }
    if (dryRun) {
      logger.info(`  [dry-run] frontmatter (cached): ${getFilename(e.filePath!)}`);
    } else {
      logger.info(`  generated (cached): ${getFilename(e.filePath!)}`);
    }
  }

  const _alreadyFilled = _misses.filter((e) => hasFrontmatterFields(e));
  const _needsGenerate = _misses.filter((e) => !hasFrontmatterFields(e));

  await Promise.all(
    _alreadyFilled.map(async (entry) => {
      const _fmSnapshot: Record<string, string | string[]> = {};
      _knownFields.forEach((k) => {
        const v = entry.frontmatter.get(k);
        if (v !== undefined) { _fmSnapshot[k] = v; }
      });
      const _existing = cache.read(entry.filePath!);
      if (!dryRun) {
        await cache.write(entry.filePath!, {
          ..._existing,
          frontmatter: _fmSnapshot,
          status: CACHE_STATUSES.NEED_REVIEW,
        });
        _generatedFiles.add(entry.filePath!);
      }
      if (dryRun) {
        logger.info(`  [dry-run] frontmatter (existing): ${getFilename(entry.filePath!)}`);
      } else {
        logger.info(`  frontmatter (existing): ${getFilename(entry.filePath!)}`);
      }
    }),
  );

  const _generate = generateProvider ?? generateFrontmatter;
  await runConcurrent(
    _needsGenerate,
    async (entry) => {
      if (dryRun) {
        logger.info(`  [dry-run] frontmatter: ${getFilename(entry.filePath!)}`);
      } else {
        let _ok: boolean;
        try {
          _ok = await _generate(entry, maxContentLength, dics, prompts, maxRetry);
        } catch (e) {
          logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)} — ${e}`);
          return;
        }
        if (_ok) {
          const _fmSnapshot: Record<string, string | string[]> = {};
          _knownFields.forEach((k) => {
            const v = entry.frontmatter.get(k);
            if (v !== undefined) { _fmSnapshot[k] = v; }
          });
          const _existing = cache.read(entry.filePath!);
          const _statusUpdate = hasFrontmatterFields(entry) ? { status: CACHE_STATUSES.NEED_REVIEW } : {};
          await cache.write(entry.filePath!, { ..._existing, frontmatter: _fmSnapshot, ..._statusUpdate });
          _generatedFiles.add(entry.filePath!);
          logger.info(`  generated: ${getFilename(entry.filePath!)}`);
        } else {
          logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)}`);
        }
      }
    },
    concurrency,
  );

  return _generatedFiles;
};

/**
 * エントリ配列を走査し、各エントリのキャッシュ status を設定する。
 *
 * - `cache.read(e.filePath!).status === 'written'` → スキップ
 * - `hasFrontmatterFields(entry) === true` → `status: 'need-review'` を書き込む
 * - それ以外 → `status: ''` を書き込む
 * - `dryRun === true` の場合は cache.write を実行しない
 *
 * @param entries - 対象エントリ配列
 * @param cache - フェーズキャッシュ
 * @param dryRun - true の場合は cache.write を実行しない
 */
const _phaseStatus = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  dryRun: boolean,
): Promise<void> => {
  await Promise.all(
    entries.map(async (entry) => {
      const _existing = cache.read(entry.filePath!);
      if (_existing.status === CACHE_STATUSES.WRITTEN) {
        return;
      }
      if (dryRun) {
        logger.info(`  [dry-run] status: ${getFilename(entry.filePath!)} - skipped`);
        return;
      }
      const _status = hasFrontmatterFields(entry)
        ? CACHE_STATUSES.NEED_REVIEW
        : CACHE_STATUSES.EMPTY;
      await cache.write(entry.filePath!, { ..._existing, status: _status });
      logger.info(`  status: ${getFilename(entry.filePath!)} - status: ${_status || '(empty)'}`);
    }),
  );
};

const _phaseReview = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  dryRun: boolean,
  reviewProvider?: _ReviewProvider,
  maxRetry = 0,
): Promise<void> => {
  const _hits = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  const _misses = entries.filter((e) => cache.read(e.filePath!).status !== CACHE_STATUSES.REVIEWED);

  _hits.forEach((e) => {
    logger.info(`  review (cached): ${getFilename(e.filePath!)}`);
  });

  const _review = reviewProvider ?? reviewFrontmatter;
  await runConcurrent(
    _misses,
    async (entry) => {
      if (dryRun) {
        logger.info(`  [dry-run] review: ${getFilename(entry.filePath!)}`);
      } else {
        let r: ReviewResult;
        try {
          r = await _review(entry, dics, prompts, maxRetry);
        } catch (e) {
          logger.warn(`  FAIL (review 失敗): ${getFilename(entry.filePath!)} — ${e}`);
          return;
        }
        if (r.validity === 'fail') {
          logger.warn(`  review FAIL: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
          await cache.delete(entry.filePath!);
        } else {
          logger.info(`  review OK: ${getFilename(entry.filePath!)}`);
          const _existing = cache.read(entry.filePath!);
          const _fmSnapshot: Record<string, string | string[]> = { ...(_existing.frontmatter ?? {}) };
          for (const k of _knownFields) {
            const v = entry.frontmatter.get(k);
            if (v !== undefined) { _fmSnapshot[k] = v as string | string[]; }
          }
          const _correctedType = (entry.frontmatter.get('type') as string | undefined) ?? _existing.type;
          const _correctedCategory = (entry.frontmatter.get('category') as string | undefined) ?? _existing.category;
          await cache.write(entry.filePath!, {
            ..._existing,
            type: _correctedType,
            category: _correctedCategory,
            frontmatter: _fmSnapshot,
            status: CACHE_STATUSES.REVIEWED,
          });
        }
      }
    },
    concurrency,
  );
};

const _filterReviewEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): ChatlogEntry[] => entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.NEED_REVIEW);

/**
 * エントリが書き込み対象かどうかを status で判定する predicate 関数。
 *
 * `review=true` の場合は `status === 'reviewed'` のみ true を返す。
 * `review=false` の場合は `status === 'reviewed'` または `status === 'need-review'` で true を返す。
 * `status === 'written'` / `status === 'review-failed'` / `status === ''` は常に false。
 *
 * @param entry - 判定対象のエントリ
 * @param cache - フェーズキャッシュ
 * @param review - true の場合は 'reviewed' のみ、false の場合は 'reviewed' と 'need-review' の両方
 * @returns 書き込み対象なら true
 */
const _filterWriteEntry = (
  filePath: string,
  cache: ChatlogWorks<SetfmCache>,
  review: boolean,
): boolean => {
  const status = cache.read(filePath).status;
  if (review) {
    return status === CACHE_STATUSES.REVIEWED;
  } else {
    return status === CACHE_STATUSES.REVIEWED || status === CACHE_STATUSES.NEED_REVIEW;
  }
};

const _phaseWrite = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  config: { outputDir: string; inputDir: string; dryRun: boolean },
  stats: Stats,
  writeProvider?: _WriteProvider,
): Promise<void> => {
  logger.info(`\nPhase 4: Markdownへ書き込み (${entries.length}件)`);
  const _write = writeProvider ?? writeFrontmatter;
  // NOTE: for...of is intentional here — writes must be sequential to preserve existing behavior
  for (const entry of entries) {
    applyCacheToEntry(entry, cache);
    if (config.dryRun) {
      const _type = (entry.frontmatter.get('type') as string) ?? '';
      const _category = (entry.frontmatter.get('category') as string) ?? '';
      logger.info(`  [dry-run] [${_type}/${_category}]: ${getFilename(entry.filePath!)} -- skipped`);
      stats.skip++;
    } else {
      const _ok = await _write(entry, cache, config.outputDir, config.inputDir);
      if (_ok) {
        logger.info(`  OK: ${getFilename(entry.filePath!)}`);
        stats.success++;
      } else {
        stats.fail++;
      }
    }
  }
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    if (!await dirExists(_config.inputDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `ディレクトリが見つかりません: ${_config.inputDir}`);
    }

    const _cache = new ChatlogWorks<SetfmCache>(
      'fm-cache',
      _config.cacheDir,
      { outputDir: _config.outputDir },
    );
    await _cache.ready;

    const [dics, prompts] = await Promise.all([loadDics(_config.dicsDir), loadPrompts(_config.promptsDir)]);
    logger.info(
      `辞書読み込み完了: category=${dics.category.split(',').length}件 `
        + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
        + `types=${dics.typeEntries.length}件`,
    );

    if (!_config.review) { logger.info('--no-review モード: Phase 3.5 をスキップします'); }

    const maxContentLength = _globalConfig.get('maxContentLength') as number;
    const stats: Stats = { total: 0, success: 0, fail: 0, skip: 0, written: 0 };

    // Phase 1: メタ読み込み
    const entries = await loadAllEntries(_config.inputDir, stats);
    logger.info(`メタ読み込み: ${entries.length}件（スキップ: ${stats.skip}件）`);
    if (entries.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 1.2: writtenフィルタ（outputDir書き込み済みを分離）
    const { writtenEntries, targetEntries } = _splitWritten(entries, _cache);
    stats.written = writtenEntries.length;
    logger.info(`writtenフィルタ: written=${writtenEntries.length}件 target=${targetEntries.length}件`);

    // Phase 1.5: 事前フィルタリング（skip / generate 分割）
    const { skipEntries, targetEntries: generateEntries } = _splitSkip(targetEntries, _cache);
    logger.info(`フィルタリング: skip=${skipEntries.length}件 generate=${generateEntries.length}件`);

    // Phase 2+3a: type・category同時判定（並列）
    if (!_config.dryRun) {
      logger.info(
        `\nPhase 2+3a: type・category同時判定開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
      );
    }
    await _phaseTypeAndCategory(
      generateEntries,
      _cache,
      maxContentLength,
      dics,
      prompts,
      _config.concurrency,
      _config.dryRun,
    );

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`);
    const _generatedFiles = await _phaseFrontmatter(
      generateEntries,
      _cache,
      maxContentLength,
      dics,
      prompts,
      _config.concurrency,
      _config.dryRun,
      undefined,
      _config.maxRetry,
    );

    // Phase 3.5pre: ステータス設定
    logger.info(`\nPhase 3.5pre: ステータス設定 (${generateEntries.length}件)`);
    await _phaseStatus(generateEntries, _cache, _config.dryRun);

    // Phase 3.5: レビュー（並列）
    if (_config.review) {
      logger.info(
        `\nPhase 3.5: フロントマターレビュー開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
      );
      const _reviewEntries = _filterReviewEntries(generateEntries, _cache);
      await _phaseReview(
        _reviewEntries,
        _cache,
        dics,
        prompts,
        _config.concurrency,
        _config.dryRun,
        undefined,
        _config.maxRetry,
      );
    } else {
      logger.info(`\nPhase 3.5: スキップ (--no-review)`);
    }

    // Phase 4: 書き込み
    const _writeEntries = targetEntries.filter((e) => _filterWriteEntry(e.filePath!, _cache, _config.review));
    if (!_config.dryRun) {
      const _failEntries = targetEntries.filter((e) => !_filterWriteEntry(e.filePath!, _cache, _config.review));
      _failEntries.forEach((e) => {
        logger.error(`  FAIL (yaml空): ${getFilename(e.filePath!)}`);
        stats.fail++;
      });
    }
    await _phaseWrite(_writeEntries, _cache, _config, stats);

    logger.info(
      `\n完了: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip} written=${stats.written} target=${targetEntries.length}`,
    );
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) {
  await main(Deno.args);
}

// ─── Test exports (テスト専用・本番コードから import 禁止)
export { _phaseTypeAndCategory as _phaseTypeAndCategoryForTest };
export { _phaseFrontmatter as _phaseFrontmatterForTest };
export { _phaseStatus as _phaseStatusForTest };
export { _phaseReview as _phaseReviewForTest };
export { _phaseWrite as _phaseWriteForTest };
export { _splitSkip as _splitSkipForTest };
export { _splitWritten as _splitWrittenForTest };
export { _filterReviewEntries as _filterReviewEntriesForTest };
export { _filterWriteEntry as _filterWriteEntryForTest };
