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
 *   Phase 1.1: ファイル列挙・メタ読み込み
 *   Phase 1.2: エントリ分割 (written/reviewed/generate)
 *   Phase 2.1: type・category同時判定 (並列, 1回のAI呼び出し)
 *   Phase 2.2: フロントマター生成 (並列, category起点)
 *   Phase 2.3: ステータス設定
 *   Phase 3.1: レビュー・修正 (並列)
 *   Phase 4.1: Markdownへ書き込み
 */

// cspell:words dics setfm

// ─── Shared scripts
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { resolveChatlogsDir } from '../../_scripts/libs/file-io/resolve-directory.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../_scripts/libs/parallel/concurrency.ts';
import { getFilename } from '../../_scripts/libs/path-utils/path-utils.ts';
// ─── Local
import { ChatlogEntry } from '../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogWorks } from '../../_scripts/classes/ChatlogWorks.class.ts';
import { loadDics, loadPrompts } from './modules/setfm-assets-loader.ts';
import { phaseFrontmatter } from './phases/phase-frontmatter.ts';
import { phaseTypeAndCategory } from './phases/phase-type-category.ts';
// types
import { CACHE_STATUSES } from '../../_scripts/types/cache-status.const.types.ts';
import { buildConfig, parseArgs } from './modules/setfm-config.ts';
import { loadAllEntries } from './modules/setfm-entry-loader.ts';
import { reviewFrontmatter } from './modules/setfm-review.ts';
import {
  applyCacheToEntry,
  extractEntryFrontmatter,
  filterFrontmatterFields,
  writeFrontmatter,
} from './modules/setfm-write.ts';
import type { SetfmCache } from './types/cache.types.ts';
import type { Dics, Prompts } from './types/dics.types.ts';
// types
import type { ReviewResult, Stats } from './types/phase.types.ts';

// ─── Internal types
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

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * エントリ配列を writtenEntries・reviewedEntries・generateEntries の3グループに分割する。
 *
 * - `writtenEntries`: `status === 'written'` のエントリ（書き込み済み・スキップ対象）
 * - `reviewedEntries`: `status === 'reviewed'` のみのエントリ（書き込み待ち）
 * - `generateEntries`: 上記以外のエントリ（`status === ''` / `'need-review'` / `'review-failed'` / `'set-types'` / キャッシュミス）
 *
 * 3グループは重複なし・漏れなし（エントリの総数が保たれる）。
 *
 * @param entries - 分割対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @returns `{ writtenEntries, reviewedEntries, generateEntries }` — 互いに素な3グループ
 */
const _splitEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): { writtenEntries: ChatlogEntry[]; reviewedEntries: ChatlogEntry[]; generateEntries: ChatlogEntry[] } => {
  const writtenEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.WRITTEN);
  const reviewedEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  const generateEntries = entries.filter((e) => {
    const status = cache.read(e.filePath!).status;
    return (
      status === undefined
      || (status !== CACHE_STATUSES.WRITTEN && status !== CACHE_STATUSES.REVIEWED)
    );
  });
  return { writtenEntries, reviewedEntries, generateEntries };
};

/**
 * エントリ配列を走査し、各エントリのキャッシュ status を設定する。
 *
 * - `cache.read(e.filePath!).status === 'written'` → スキップ
 * - `entry.frontmatter.hasRequiredFields() === true` → `status: 'need-review'` を書き込む
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
      const _status = entry.frontmatter.hasRequiredFields()
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
        if (r.validity === 'pass') {
          logger.info(`  review OK: ${getFilename(entry.filePath!)}`);
          const _existing = cache.read(entry.filePath!);
          const _fmSnapshot = { ...(_existing.frontmatter ?? {}), ...extractEntryFrontmatter(entry) };
          const _correctedType = (entry.frontmatter.get('type') as string | undefined) ?? _existing.type;
          const _correctedCategory = (entry.frontmatter.get('category') as string | undefined) ?? _existing.category;
          await cache.write(entry.filePath!, {
            ..._existing,
            type: _correctedType,
            category: _correctedCategory,
            frontmatter: _fmSnapshot,
            status: CACHE_STATUSES.REVIEWED,
          });
        } else if (r.validity === 'corrected') {
          logger.info(`  review corrected: ${getFilename(entry.filePath!)}`);
          const _existing = cache.read(entry.filePath!);
          const _filtered = filterFrontmatterFields(r.corrected ?? {});
          const _fmSnapshot = { ...(_existing.frontmatter ?? {}), ..._filtered };
          const _correctedType = (_filtered['type'] as string | undefined) ?? _existing.type;
          const _correctedCategory = (_filtered['category'] as string | undefined) ?? _existing.category;
          await cache.write(entry.filePath!, {
            ..._existing,
            type: _correctedType,
            category: _correctedCategory,
            frontmatter: _fmSnapshot,
            status: CACHE_STATUSES.REVIEWED,
          });
        } else {
          // r.validity === 'error'
          logger.warn(`  review error: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
          const _existing = cache.read(entry.filePath!);
          await cache.write(entry.filePath!, {
            ..._existing,
            status: CACHE_STATUSES.REVIEW_FAILED,
          });
        }
      }
    },
    concurrency,
  );
};

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
  logger.info(`\nPhase 4.1: Markdownへ書き込み (${entries.length}件)`);
  const _write = writeProvider ?? writeFrontmatter;
  // NOTE: for...of is intentional here — writes must be sequential to preserve existing behavior
  for (const entry of entries) {
    applyCacheToEntry(entry, cache.read(entry.filePath!));
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
    const _globalConfig = GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);
    const _inputDir = resolveChatlogsDir({
      chatlogsDir: _config.chatlogsDir,
      agent: _config.agent,
      period: _config.period,
      addOnDir: 'normalizelogs',
      override: _config.inputDir || undefined,
    });

    if (!await dirExists(_inputDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `ディレクトリが見つかりません: ${_inputDir}`);
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

    if (!_config.review) { logger.info('--no-review モード: Phase 3.1 をスキップします'); }

    const maxContentLength = _globalConfig.get('maxContentLength') as number;
    const stats: Stats = { total: 0, success: 0, fail: 0, skip: 0, written: 0 };

    // Phase 1.1: メタ読み込み
    const entries = await loadAllEntries(_inputDir, stats);
    logger.info(`メタ読み込み: ${entries.length}件（スキップ: ${stats.skip}件）`);
    if (entries.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 1.2: エントリ3分割（written / reviewed / generate）
    const { writtenEntries, reviewedEntries, generateEntries } = _splitEntries(entries, _cache);
    stats.written = writtenEntries.length;
    logger.info(
      `分割: written=${writtenEntries.length}件 reviewed=${reviewedEntries.length}件 generate=${generateEntries.length}件`,
    );

    // Phase 2.1: type・category同時判定（並列）
    logger.info(
      `\nPhase 2.1: type・category判定開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
    );
    await phaseTypeAndCategory(
      generateEntries,
      _cache,
      maxContentLength,
      dics,
      prompts,
      _config.concurrency,
      _config.dryRun,
    );

    // Phase 2.2: フロントマター生成（並列）
    logger.info(`\nPhase 2.2: フロントマター生成開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`);
    await phaseFrontmatter(
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

    // Phase 2.3: ステータス設定
    logger.info(`\nPhase 2.3: ステータス設定 (${generateEntries.length}件)`);
    await _phaseStatus(generateEntries, _cache, _config.dryRun);

    // Phase 3.1: レビュー（並列）
    if (_config.review) {
      logger.info(
        `\nPhase 3.1: フロントマターレビュー開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
      );
      await _phaseReview(
        generateEntries,
        _cache,
        dics,
        prompts,
        _config.concurrency,
        _config.dryRun,
        undefined,
        _config.maxRetry,
      );
    } else {
      logger.info(`\nPhase 3.1: スキップ (--no-review)`);
    }

    // Phase 4.1: 書き込み
    const _candidateEntries = [...reviewedEntries, ...generateEntries];
    const _writeEntries = _candidateEntries.filter((e) => _filterWriteEntry(e.filePath!, _cache, _config.review));
    if (!_config.dryRun) {
      const _failEntries = _candidateEntries.filter((e) => !_filterWriteEntry(e.filePath!, _cache, _config.review));
      _failEntries.forEach((e) => {
        logger.error(`  FAIL (yaml空): ${getFilename(e.filePath!)}`);
        stats.fail++;
      });
    }
    await _phaseWrite(_writeEntries, _cache, { ..._config, inputDir: _inputDir }, stats);

    logger.info(
      `\n完了: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip} written=${stats.written} target=${_candidateEntries.length}`,
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
export { _phaseStatus as _phaseStatusForTest };
export { _phaseReview as _phaseReviewForTest };
export { _phaseWrite as _phaseWriteForTest };
export { _splitEntries as _splitEntriesForTest };
export { _filterWriteEntry as _filterWriteEntryForTest };
