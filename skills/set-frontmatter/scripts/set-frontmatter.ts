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
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts --target-dir <dir> [--dry-run] [--review] [--no-review] [--dics DIR] [--config FILE]
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
import { loadDics, loadPrompts } from './modules/setfm-assets-loader.ts';
import { getCacheSlug, readCache, writeCache } from '../../_scripts/libs/cache/cache-utils.ts';
// types
import type { SetfmCache } from './types/cache.types.ts';
import { buildConfig, parseArgs } from './modules/setfm-config.ts';
import { loadAllEntries } from './modules/setfm-entry-loader.ts';
import { generateFrontmatter } from './modules/setfm-frontmatter.ts';
import { reviewFrontmatter } from './modules/setfm-review.ts';
import { judgeTypeAndCategory } from './modules/setfm-type-category.ts';
import { writeFrontmatter } from './modules/setfm-write.ts';
// types
import type { Stats } from './types/phase.types.ts';

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

    if (_config.dryRun) {
      for (const entry of entries) {
        logger.info(`  [dry-run] ${getFilename(entry.filePath!)}`);
      }
      logger.info(`\n完了 (dry-run): total=${entries.length} skip=${stats.skip}`);
      return;
    }

    // Phase 2+3a: type・category同時判定（並列）
    logger.info(`\nPhase 2+3a: type・category同時判定開始 (${entries.length}件 × 並列度${_config.concurrency})`);
    await runConcurrent(
      entries,
      async (entry) => {
        const _slug = getCacheSlug(entry.filePath!);
        const _cache = await readCache<SetfmCache>(_config.cacheDir, _slug);
        if (_cache.type && _cache.category) {
          entry.frontmatter.set('type', _cache.type);
          entry.frontmatter.set('category', _cache.category);
          logger.info(`  type+category (cached): ${getFilename(entry.filePath!)}`);
        } else {
          await judgeTypeAndCategory(entry, maxContentLength, dics, prompts);
          await writeCache(_config.cacheDir, _slug, {
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
      _config.concurrency,
    );

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${entries.length}件 × 並列度${_config.concurrency})`);
    const _generatedFiles = new Set<string>();
    await runConcurrent(
      entries,
      async (entry) => {
        const _slug = getCacheSlug(entry.filePath!);
        const _cache = await readCache<SetfmCache>(_config.cacheDir, _slug);
        if (_cache.frontmatter) {
          Object.entries(_cache.frontmatter).forEach(([k, v]) => entry.frontmatter.set(k, v));
          _generatedFiles.add(entry.filePath!);
          logger.info(`  generated (cached): ${getFilename(entry.filePath!)}`);
        } else {
          const _ok = await generateFrontmatter(entry, maxContentLength, dics, prompts);
          if (_ok) {
            const _knownFields = ['title', 'date', 'session_id', 'project', 'slug', 'summary', 'topics', 'tags'];
            const _fmSnapshot: Record<string, string | string[]> = {};
            _knownFields.forEach((k) => {
              const v = entry.frontmatter.get(k);
              if (v !== undefined) { _fmSnapshot[k] = v; }
            });
            await writeCache(_config.cacheDir, _slug, { frontmatter: _fmSnapshot });
            _generatedFiles.add(entry.filePath!);
            logger.info(`  generated: ${getFilename(entry.filePath!)}`);
          } else {
            logger.warn(`  FAIL (生成失敗): ${getFilename(entry.filePath!)}`);
          }
        }
      },
      _config.concurrency,
    );

    // Phase 3.5: レビュー（並列）
    if (_config.review) {
      logger.info(
        `\nPhase 3.5: フロントマターレビュー開始 (${entries.length}件 × 並列度${_config.concurrency})`,
      );
      const _reviewEntries = entries.filter((e) => _generatedFiles.has(e.filePath!));
      await runConcurrent(
        _reviewEntries,
        async (entry) => {
          const r = await reviewFrontmatter(entry, dics, prompts);
          if (r.validity === 'fail') {
            logger.warn(`  review FAIL: ${getFilename(entry.filePath!)} — ${r.errors.join('; ')}`);
          } else {
            logger.info(`  review OK: ${getFilename(entry.filePath!)}`);
          }
        },
        _config.concurrency,
      );
    } else {
      logger.info(`\nPhase 3.5: スキップ (--no-review)`);
    }

    // Phase 4: 書き込み
    logger.info(`\nPhase 4: Markdownへ書き込み`);
    for (const entry of entries) {
      if (!_generatedFiles.has(entry.filePath!)) {
        logger.error(`  FAIL (yaml空): ${getFilename(entry.filePath!)}`);
        stats.fail++;
        continue;
      }
      await writeFrontmatter(entry, _config.targetDir, _config.inputDir, _config.dryRun, stats);
    }

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
