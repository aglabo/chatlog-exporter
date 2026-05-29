#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
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
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts --target-dir <dir> [--dry-run] [--no-review] [--dics DIR] [--config FILE]
 *
 * 処理フロー:
 *   Phase 1: ファイル列挙・メタ読み込み
 *   Phase 2: type判定 (並列)
 *   Phase 3a: category判定 (並列, typeごとの外部プロンプト使用)
 *   Phase 3b: フロントマター生成 (並列, category起点)
 *   Phase 3.5: レビュー・修正 (並列)
 *   Phase 4: Markdownへ書き込み
 */

// cspell:words dics setfm

// ─── Shared scripts
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../_scripts/libs/parallel/concurrency.ts';

// ─── Local
import { loadDics, loadEntryMeta } from './modules/setfm-ai.ts';
import { buildConfig, parseArgs } from './modules/setfm-config.ts';
import {
  generateFrontmatter,
  judgeCategory,
  judgeType,
  reviewFrontmatter,
  writeFrontmatter,
} from './modules/setfm-phases.ts';
// types
import type { EntryMeta } from './types/entry-meta.types.ts';
import type { Stats } from './types/phase.types.ts';

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const { targetDir, dicsDir, dryRun, review, concurrency } = buildConfig(_parsed, _globalConfig);

    if (!await dirExists(targetDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `ディレクトリが見つかりません: ${targetDir}`);
    }

    const dics = await loadDics(dicsDir);
    logger.info(
      `辞書読み込み完了: category=${dics.category.split(',').length}件 `
        + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
        + `types=${dics.typeEntries.length}件`,
    );

    const allFiles = await findFiles(targetDir);
    logger.info(`対象ファイル数: ${allFiles.length}`);
    if (dryRun) { logger.info('dry-run モード: ファイルは更新しません'); }
    if (!review) { logger.info('--no-review モード: Phase 3.5 をスキップします'); }
    if (allFiles.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 1: メタ読み込み
    const fileMetaList: EntryMeta[] = [];
    const stats: Stats = { total: allFiles.length, success: 0, fail: 0, skip: 0 };
    for (const filePath of allFiles) {
      const fm = await loadEntryMeta(filePath);
      if (!fm) {
        logger.info(`  skip: ${filePath.split(/[/\\]/).pop()}`);
        stats.skip++;
      } else { fileMetaList.push(fm); }
    }
    logger.info(`メタ読み込み: ${fileMetaList.length}件（スキップ: ${stats.skip}件）`);

    // Phase 2: type判定（並列）
    logger.info(`\nPhase 2: type判定開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const typeResults = await runConcurrent(fileMetaList, (fm) => judgeType(fm, dics), concurrency);
    const typeMap = new Map(typeResults.map((r) => [r.file, r]));
    for (const r of typeResults) { logger.info(`  type [${r.type}]: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3a: category判定（並列）
    logger.info(`\nPhase 3a: category判定開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const categoryResults = await runConcurrent(
      fileMetaList,
      async (fm) => {
        const type = typeMap.get(fm.file)?.type ?? 'research';
        const category = await judgeCategory(fm, type, dics);
        logger.info(`  category [${category}]: ${fm.file.split(/[/\\]/).pop()}`);
        return { file: fm.file, type, category };
      },
      concurrency,
    );
    const categoryMap = new Map(categoryResults.map((r) => [r.file, r]));

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const fmResults = await runConcurrent(
      fileMetaList,
      (fm) => {
        const cr = categoryMap.get(fm.file);
        const type = cr?.type ?? 'research';
        const category = cr?.category ?? 'development';
        return generateFrontmatter(fm, type, category, dics);
      },
      concurrency,
    );
    const fmResultMap = new Map(fmResults.map((r) => [r.file, r]));
    for (const r of fmResults) { logger.info(`  generated: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3.5: レビュー（並列）
    if (review) {
      logger.info(`\nPhase 3.5: フロントマターレビュー開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
      const reviewResults = await runConcurrent(
        fmResults.filter((r) => r.yaml),
        (r) => reviewFrontmatter(r, dics),
        concurrency,
      );
      for (const r of reviewResults) {
        if (r.validity === 'fail') {
          logger.warn(`  review FAIL: ${r.file.split(/[/\\]/).pop()} — ${r.errors.join('; ')}`);
          const fm = fmResultMap.get(r.file);
          if (fm) {
            fmResultMap.set(r.file, {
              ...fm,
              type: r.correctedType || fm.type,
              category: r.correctedCategory || fm.category,
              yaml: r.correctedYaml || fm.yaml,
            });
          }
        } else {
          logger.info(`  review OK: ${r.file.split(/[/\\]/).pop()}`);
        }
      }
    } else {
      logger.info(`\nPhase 3.5: スキップ (--no-review)`);
    }

    // Phase 4: 書き込み
    logger.info(`\nPhase 4: Markdownへ書き込み`);
    for (const fm of fileMetaList) {
      const result = fmResultMap.get(fm.file);
      if (!result) {
        stats.fail++;
        continue;
      }
      await writeFrontmatter(fm, result, dryRun, stats);
    }

    const drySuffix = dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip}`,
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
