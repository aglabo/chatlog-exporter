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
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts --target-dir <dir> [--dry-run] [--review] [--no-review] [--dics DIR] [--config FILE]
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
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runChunked, runConcurrent } from '../../_scripts/libs/parallel/concurrency.ts';

// ─── Local
import { judgeCategory } from './modules/setfm-category.ts';
import { buildConfig, parseArgs } from './modules/setfm-config.ts';
import { generateFrontmatter } from './modules/setfm-frontmatter.ts';
import { loadAllEntries, loadDics, loadPrompts } from './modules/setfm-loader.ts';
import { reviewFrontmatter } from './modules/setfm-review.ts';
import { judgeType } from './modules/setfm-type.ts';
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

    if (!await dirExists(_config.targetDir)) {
      throw new ChatlogError('InputNotFound', 'NotFound', `ディレクトリが見つかりません: ${_config.targetDir}`);
    }

    const [dics, prompts] = await Promise.all([loadDics(_config.dicsDir), loadPrompts(_config.promptsDir)]);
    logger.info(
      `辞書読み込み完了: category=${dics.category.split(',').length}件 `
        + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
        + `types=${dics.typeEntries.length}件`,
    );

    if (_config.dryRun) { logger.info('dry-run モード: ファイルは更新しません'); }
    if (!_config.review) { logger.info('--no-review モード: Phase 3.5 をスキップします'); }

    const maxContentLength = _globalConfig.get('maxContentLength') as number;
    const stats: Stats = { total: 0, success: 0, fail: 0, skip: 0 };

    // Phase 1: メタ読み込み
    const entries = await loadAllEntries(_config.targetDir, maxContentLength, stats);
    logger.info(`メタ読み込み: ${entries.length}件（スキップ: ${stats.skip}件）`);
    if (entries.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 2: type判定（バッチ並列）
    logger.info(
      `\nPhase 2: type判定開始 (${entries.length}件 × チャンク${_config.chunkSize} × 並列度${_config.concurrency})`,
    );
    const typeChunks = await runChunked(
      entries,
      _config.chunkSize,
      (chunk) => judgeType(chunk, maxContentLength, dics, prompts),
      _config.concurrency,
    );
    const typeResults = typeChunks.flat();
    const typeMap = new Map(typeResults.map((r) => [r.file, r]));
    for (const r of typeResults) { logger.info(`  type [${r.type}]: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3a: category判定（並列）
    logger.info(`\nPhase 3a: category判定開始 (${entries.length}件 × 並列度${_config.concurrency})`);
    const categoryResults = await runConcurrent(
      entries,
      async (entry) => {
        const type = typeMap.get(entry.filePath!)?.type ?? 'research';
        const category = await judgeCategory(entry, maxContentLength, type, dics, prompts);
        logger.info(`  category [${category}]: ${entry.filePath!.split(/[/\\]/).pop()}`);
        return { file: entry.filePath!, type, category };
      },
      _config.concurrency,
    );
    const categoryMap = new Map(categoryResults.map((r) => [r.file, r]));

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${entries.length}件 × 並列度${_config.concurrency})`);
    const fmResults = await runConcurrent(
      entries,
      (entry) => {
        const cr = categoryMap.get(entry.filePath!);
        const type = cr?.type ?? 'research';
        const category = cr?.category ?? 'development';
        return generateFrontmatter(entry, maxContentLength, type, category, dics, prompts);
      },
      _config.concurrency,
    );
    const fmResultMap = new Map(fmResults.map((r) => [r.file, r]));
    for (const r of fmResults) { logger.info(`  generated: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3.5: レビュー（並列）
    if (_config.review) {
      logger.info(
        `\nPhase 3.5: フロントマターレビュー開始 (${entries.length}件 × 並列度${_config.concurrency})`,
      );
      const reviewResults = await runConcurrent(
        fmResults.filter((r) => r.yaml),
        (r) => reviewFrontmatter(r, dics, prompts),
        _config.concurrency,
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
    for (const entry of entries) {
      const result = fmResultMap.get(entry.filePath!);
      if (!result) {
        stats.fail++;
        continue;
      }
      await writeFrontmatter(entry, result, _config.dryRun, stats);
    }

    const drySuffix = _config.dryRun ? ' (dry-run)' : '';
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
