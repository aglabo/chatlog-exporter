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
import { hasFrontmatterFields as _hasFrontmatterFields, writeFrontmatter } from './modules/setfm-write.ts';
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
) => Promise<boolean>;

type _ReviewProvider = (
  entry: ChatlogEntry,
  dics: Dics,
  prompts: Prompts,
) => Promise<ReviewResult>;

type _WriteProvider = (
  entry: ChatlogEntry,
  cache: ChatlogWorks<SetfmCache>,
  outputDir: string,
  inputDir: string,
  dryRun: boolean,
) => Promise<boolean>;

// ─── Internal constants
const _knownFields = ['title', 'date', 'session_id', 'project', 'slug', 'summary', 'topics', 'tags'];

// ─────────────────────────────────────────────
// 内部関数
// ─────────────────────────────────────────────

/**
 * エントリの frontmatter に 6 フィールドすべてが充足しているか判定する。
 * - type: string かつ非空
 * - category: string かつ非空
 * - title: string かつ非空
 * - summary: string かつ非空
 * - topics: string[] かつ length >= 1
 * - tags: string[] かつ length >= 1
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
 * エントリ配列を skip と generate に分割する。
 *
 * 判定優先順位:
 * 1. `cache.read(e.filePath!).reviewed === true` → skip（全フェーズ完了済み）
 * 2. `_hasFrontmatterFields(e) === true` → skip（フロントマターが既に完全）
 * 3. それ以外 → generate
 *
 * @param entries - 分割対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @returns `{ skipEntries, generateEntries }` — 重複なし・漏れなしで分割されたエントリ配列
 */
const _filterEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): { skipEntries: ChatlogEntry[]; targetEntries: ChatlogEntry[] } => {
  const skipEntries = entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  const targetEntries = entries.filter((e) => cache.read(e.filePath!).status !== CACHE_STATUSES.REVIEWED);
  return { skipEntries, targetEntries };
};

const _phaseTypeAndCategory = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  maxContentLength: number,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
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
  generateProvider?: _GenerateProvider,
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
    if (_hasFrontmatterFields(e)) {
      await cache.write(e.filePath!, { ..._cached, status: CACHE_STATUSES.NEED_REVIEW });
    }
    logger.info(`  generated (cached): ${getFilename(e.filePath!)}`);
  }

  const _alreadyFilled = _misses.filter((e) => _hasFrontmatterFields(e));
  const _needsGenerate = _misses.filter((e) => !_hasFrontmatterFields(e));

  await Promise.all(
    _alreadyFilled.map(async (entry) => {
      const _fmSnapshot: Record<string, string | string[]> = {};
      _knownFields.forEach((k) => {
        const v = entry.frontmatter.get(k);
        if (v !== undefined) { _fmSnapshot[k] = v; }
      });
      const _existing = cache.read(entry.filePath!);
      await cache.write(entry.filePath!, {
        ..._existing,
        frontmatter: _fmSnapshot,
        status: CACHE_STATUSES.NEED_REVIEW,
      });
      _generatedFiles.add(entry.filePath!);
      logger.info(`  frontmatter (existing): ${getFilename(entry.filePath!)}`);
    }),
  );

  const _generate = generateProvider ?? generateFrontmatter;
  await runConcurrent(
    _needsGenerate,
    async (entry) => {
      const _ok = await _generate(entry, maxContentLength, dics, prompts);
      if (_ok) {
        const _fmSnapshot: Record<string, string | string[]> = {};
        _knownFields.forEach((k) => {
          const v = entry.frontmatter.get(k);
          if (v !== undefined) { _fmSnapshot[k] = v; }
        });
        const _existing = cache.read(entry.filePath!);
        const _statusUpdate = _hasFrontmatterFields(entry) ? { status: CACHE_STATUSES.NEED_REVIEW } : {};
        await cache.write(entry.filePath!, { ..._existing, frontmatter: _fmSnapshot, ..._statusUpdate });
        _generatedFiles.add(entry.filePath!);
        logger.info(`  generated: ${getFilename(entry.filePath!)}`);
      } else {
        logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)}`);
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
 * - `_hasFrontmatterFields(entry) === true` → `status: 'need-review'` を書き込む
 * - それ以外 → `status: ''` を書き込む
 *
 * @param entries - 対象エントリ配列
 * @param cache - フェーズキャッシュ
 */
const _phaseStatus = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): Promise<void> => {
  await Promise.all(
    entries.map(async (entry) => {
      const _existing = cache.read(entry.filePath!);
      if (_existing.status === CACHE_STATUSES.WRITTEN) {
        return;
      }
      const _status = _hasFrontmatterFields(entry)
        ? CACHE_STATUSES.NEED_REVIEW
        : CACHE_STATUSES.EMPTY;
      await cache.write(entry.filePath!, { ..._existing, status: _status });
    }),
  );
};

const _phaseReview = async (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  dics: Dics,
  prompts: Prompts,
  concurrency: number,
  reviewProvider?: _ReviewProvider,
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
      const r = await _review(entry, dics, prompts);
      if (r.validity === 'fail') {
        logger.warn(`  review FAIL: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
      } else {
        logger.info(`  review OK: ${getFilename(entry.filePath!)}`);
      }
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
        status: r.validity === 'fail' ? CACHE_STATUSES.REVIEW_FAILED : CACHE_STATUSES.REVIEWED,
      });
    },
    concurrency,
  );
};

const _filterReviewEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
): ChatlogEntry[] => entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.NEED_REVIEW);

/**
 * 書き込み対象エントリを status でフィルタリングする。
 *
 * `status === 'reviewed'` または `status === 'need-review'` のエントリのみを返す。
 * `status === 'written'` および `status` が未設定のエントリは除外する。
 *
 * @param entries - フィルタ対象のエントリ配列
 * @param cache - フェーズキャッシュ
 * @param reviewOnly - true の場合は 'reviewed' のみ、false の場合は 'reviewed' と 'need-review' の両方
 * @returns フィルタ後のエントリ配列
 */
const _filterWriteEntries = (
  entries: ChatlogEntry[],
  cache: ChatlogWorks<SetfmCache>,
  reviewOnly: boolean,
): ChatlogEntry[] => {
  if (reviewOnly) {
    return entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.REVIEWED);
  } else {
    return entries.filter((e) => cache.read(e.filePath!).status === CACHE_STATUSES.NEED_REVIEW);
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
    const _ok = await _write(entry, cache, config.outputDir, config.inputDir, config.dryRun);
    if (_ok) {
      logger.info(`  OK: ${getFilename(entry.filePath!)}`);
      stats.success++;
    } else {
      stats.fail++;
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

    const _cache = new ChatlogWorks<SetfmCache>('fm-cache', _config.cacheDir);
    await _cache.ready;

    const [dics, prompts] = await Promise.all([loadDics(_config.dicsDir), loadPrompts(_config.promptsDir)]);
    logger.info(
      `辞書読み込み完了: category=${dics.category.split(',').length}件 `
        + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
        + `types=${dics.typeEntries.length}件`,
    );

    if (!_config.review) { logger.info('--no-review モード: Phase 3.5 をスキップします'); }

    const maxContentLength = _globalConfig.get('maxContentLength') as number;
    const stats: Stats = { total: 0, success: 0, fail: 0, skip: 0 };

    // Phase 1: メタ読み込み
    const entries = await loadAllEntries(_config.inputDir, stats);
    logger.info(`メタ読み込み: ${entries.length}件（スキップ: ${stats.skip}件）`);
    if (entries.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 1.5: 事前フィルタリング（skip / generate 分割）
    const { skipEntries, targetEntries: generateEntries } = _filterEntries(entries, _cache);
    logger.info(`フィルタリング: skip=${skipEntries.length}件 generate=${generateEntries.length}件`);

    if (_config.dryRun) {
      for (const entry of entries) {
        logger.info(`  [dry-run] ${getFilename(entry.filePath!)}`);
      }
      logger.info(`\n完了 (dry-run): total=${entries.length} skip=${stats.skip}`);
      return;
    }

    // Phase 2+3a: type・category同時判定（並列）
    logger.info(
      `\nPhase 2+3a: type・category同時判定開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
    );
    await _phaseTypeAndCategory(generateEntries, _cache, maxContentLength, dics, prompts, _config.concurrency);

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`);
    const _generatedFiles = await _phaseFrontmatter(
      generateEntries,
      _cache,
      maxContentLength,
      dics,
      prompts,
      _config.concurrency,
    );

    // Phase 3.5: レビュー（並列）
    if (_config.review) {
      logger.info(
        `\nPhase 3.5: フロントマターレビュー開始 (${generateEntries.length}件 × 並列度${_config.concurrency})`,
      );
      const _reviewEntries = generateEntries.filter((e) => _generatedFiles.has(e.filePath!));
      await _phaseReview(_reviewEntries, _cache, dics, prompts, _config.concurrency);
    } else {
      logger.info(`\nPhase 3.5: スキップ (--no-review)`);
    }

    // Phase 4 前: skip 済みエントリを _generatedFiles に追加（writeFrontmatter を通す）
    skipEntries.forEach((e) => _generatedFiles.add(e.filePath!));

    // Phase 4: 書き込み
    const _writeEntries = entries.filter((e) => _generatedFiles.has(e.filePath!));
    const _failEntries = entries.filter((e) => !_generatedFiles.has(e.filePath!));
    _failEntries.forEach((e) => {
      logger.error(`  FAIL (yaml空): ${getFilename(e.filePath!)}`);
      stats.fail++;
    });
    await _phaseWrite(_writeEntries, _cache, _config, stats);

    logger.info(
      `\n完了: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip}`,
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
export { _phaseReview as _phaseReviewForTest };
export { _hasFrontmatterFields as _hasFrontmatterFieldsForTest };
export { _filterEntries as _filterEntriesForTest };
