#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/classify-chatlogs.ts
// @(#): チャットログをプロジェクト別サブディレクトリに分類する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * classify-chatlogs.ts — チャットログをプロジェクト別サブディレクトリに分類する
 *
 * 使い方:
 *   deno run --allow-read --allow-run --allow-write classify-chatlogs.ts \
 *     [agent] [YYYY-MM] [--dry-run] [--config FILE] --input DIR
 */

// -- external --
import { isValidModel } from '../../_scripts/libs/ai/model-utils.ts';
import { runAI } from '../../_scripts/libs/ai/run-ai.ts';
import { readTextFile } from '../../_scripts/libs/file-io/read-utils.ts';
import { dirExists } from '../../_scripts/libs/file-ops/exists-utils.ts';
import { findEntries } from '../../_scripts/libs/file-ops/find-entries.ts';
import { parseArgsToConfig } from '../../_scripts/libs/io/parse-args.ts';
import { runChunked } from '../../_scripts/libs/parallel/concurrency.ts';
import { getDirectory } from '../../_scripts/libs/path-utils/path-utils.ts';
import { parseJsonArray } from '../../_scripts/libs/text/json-utils.ts';
import { normalizeLine } from '../../_scripts/libs/text/line-utils.ts';
// instances
import { logger } from '../../_scripts/libs/io/logger.ts';
// constants

// classes
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../_scripts/classes/GlobalConfig.class.ts';

// -- internal --
// functions
import { loadProjectDic } from './libs/load-project-dic.ts';
// constants
import {
  DEFAULT_CLASSIFY_CONFIG,
  FALLBACK_PROJECT,
  MIN_CLASSIFIABLE_LENGTH,
} from './constants/classify.constants.ts';
// classes
import { ClassifyChatlogEntry } from './classes/ClassifyChatlogEntry.class.ts';
// types
import type {
  ClassifyConfig,
  ClassifyResult,
  ClassifyStats,
  ParsedConfig,
  ProjectDicEntry,
} from './types/classify.types.ts';

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

/** `--option value` 形式のオプションと ParsedConfig キーのマッピング。 */
const _OPT_KEYS: Record<string, keyof ParsedConfig> = {
  '--input': 'inputDir',
  '--model': 'model',
  '--config': 'configFile',
};

/** `--flag` 形式（値なし）のオプションと ParsedConfig キーのマッピング。 */
const _OPT_FLAGS: Record<string, keyof ParsedConfig> = {
  '--dry-run': 'dryRun',
};

export const parseArgs = (args: string[]): ParsedConfig => {
  return parseArgsToConfig<ParsedConfig>(args, _OPT_KEYS, _OPT_FLAGS) as ParsedConfig;
};

// ─────────────────────────────────────────────
// 設定構築
// ─────────────────────────────────────────────

/**
 * ParsedConfig・GlobalConfig・デフォルト値から完全な ClassifyConfig を構築する。
 * - agent 優先順位: `parsed.agent` > `globalConfig.get('agent')` > `defaults.agent`
 * - model 優先順位: `parsed.model` > `globalConfig.get('model')` > `defaults.model`
 * - inputDir 優先順位: `parsed.inputDir` > `parsed.chatlogsDir` > `globalConfig.get('chatlogsDir')` > `defaults.inputDir`
 * - dicsDir 優先順位: `globalConfig.get('dicsDir')` > `defaults.dicsDir`
 * - projectsDic: `parsed.configFile` のディレクトリ + `/projects.dic`。未指定時は `defaults.projectsDic`。
 * - 不正なモデル名は `ChatlogError('InvalidArgs')` をスローする。
 * - `configFile` は ClassifyConfig に存在しないため結果に含まれない。
 */
export function buildConfig(
  parsed: ParsedConfig,
  globalConfig: GlobalConfig,
  defaults?: ClassifyConfig,
): ClassifyConfig {
  const _defaults = defaults ?? DEFAULT_CLASSIFY_CONFIG;
  const _model = parsed.model ?? globalConfig.get('model') as string;
  if (!isValidModel(_model)) {
    throw new ChatlogError('InvalidArgs', `不正なモデル名: ${_model}`);
  }
  const _agent = parsed.agent ?? globalConfig.get('agent') as string;
  const _dicsDir = globalConfig.get('dicsDir') as string;
  const _inputDir = parsed.inputDir ?? parsed.chatlogsDir ?? globalConfig.get('chatlogsDir') as string;
  const _projectsDic = `${_dicsDir}/projects.dic`;
  const { configFile: _cf, ...rest } = parsed;
  return {
    ..._defaults,
    ...rest,
    agent: _agent,
    model: _model,
    dicsDir: _dicsDir,
    projectsDic: _projectsDic,
    inputDir: _inputDir,
  };
}

// ─────────────────────────────────────────────
// メタデータ読み込み
// ─────────────────────────────────────────────

/**
 * ファイルを読み込み、分類処理に必要なメタデータを返す。
 * - 読み込みに失敗した場合は `null` を返す（エラーをスローしない）。
 * - フロントマターへのアクセスは `entry.frontmatter.get()` を使用する。
 */
export const loadClassifyFileMeta = async (filePath: string): Promise<ClassifyChatlogEntry | null> => {
  try {
    const text = await readTextFile(filePath);
    return new ClassifyChatlogEntry(text, filePath);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────
// ファイル分類・移動
// ─────────────────────────────────────────────

/**
 * 1ファイルを指定プロジェクトのサブディレクトリへ移動し、フロントマターを更新する。
 * - `dryRun` が `true` の場合は移動せずログのみ出力して `stats.moved` をインクリメントする。
 * - 移動エラーは `stats.error` をインクリメントしてログに記録する（スローしない）。
 */
export const classifyFile = async (
  fileMeta: ClassifyChatlogEntry,
  project: string,
  dryRun: boolean,
  stats: ClassifyStats,
): Promise<void> => {
  const srcPath = fileMeta.filePath;
  const srcDir = getDirectory(srcPath);
  const dstDir = `${srcDir}/${project}`;
  const dstPath = `${dstDir}/${fileMeta.filename}`;

  if (dryRun) {
    logger.info(`[dry-run] ${fileMeta.filename} → ${project}/`);
    stats.moved++;
    return;
  }

  try {
    await Deno.mkdir(dstDir, { recursive: true });
    await Deno.rename(srcPath, dstPath);

    fileMeta.frontmatter.set('project', project);
    const newText = fileMeta.renderEntry();
    await Deno.writeTextFile(dstPath, normalizeLine(newText));

    logger.info(`moved: ${fileMeta.filename} → ${project}/`);
    stats.moved++;
  } catch (e) {
    logger.error(`  移動失敗: ${fileMeta.filename}: ${e}`);
    stats.error++;
  }
};

// ─────────────────────────────────────────────
// AI プロンプト構築
// ─────────────────────────────────────────────

/**
 * AI へ渡すバッチ分類プロンプトを構築する。
 * - メタデータ（title/category/topics/tags）がすべて空のファイルは、本文先頭 500 文字を `body:` として付加する。
 */
export const buildClassifyPrompt = (files: ClassifyChatlogEntry[], projects: ProjectDicEntry): string => {
  const _projectList = Object.keys(projects).join(', ');
  const header = `Projects: ${_projectList}\n\n`;

  const _parts = files.map((f, i) => {
    const _fm = f.frontmatter;
    const _title = _fm.get('title');
    const _category = _fm.get('category');
    const _topics = _fm.get('topics');
    const _tags = _fm.get('tags');

    const title = typeof _title === 'string' ? _title : '';
    const category = typeof _category === 'string' ? _category : '';
    const topics = Array.isArray(_topics) ? _topics as string[] : [];
    const tags = Array.isArray(_tags) ? _tags as string[] : [];

    const topicsStr = topics.length > 0 ? topics.join(', ') : '(none)';
    const tagsStr = tags.length > 0 ? tags.join(', ') : '(none)';
    const hasMeta = (typeof _title === 'string' && _title)
      || (typeof _category === 'string' && _category)
      || (Array.isArray(_topics) && _topics.length > 0)
      || (Array.isArray(_tags) && _tags.length > 0);

    const _lines = [
      `=== FILE ${i + 1}: ${f.filename} ===`,
      `title: ${title || '(no title)'}`,
      `category: ${category || '(none)'}`,
      `topics: ${topicsStr}`,
      `tags: ${tagsStr}`,
    ];
    if (!hasMeta) {
      const snippet = f.content.slice(0, 500).trim();
      _lines.push(`body: ${snippet}`);
    }
    return _lines.join('\n');
  });

  return header + _parts.join('\n\n');
};

/** AI へ渡すシステムプロンプトを構築する。JSON 配列のみを出力するよう指示する。 */
export const buildSystemPrompt = (projects: ProjectDicEntry): string => {
  const _projectList = Object.keys(projects).join(', ');
  return `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","project":"<project_name>","confidence":0.0,"reason":"..."},...]

Choose project ONLY from this list: ${_projectList}
If no project matches well, use "${FALLBACK_PROJECT}".
If the file has no metadata AND the body is fewer than 3 lines, assign "${FALLBACK_PROJECT}" unconditionally.
Base your decision on: title, category, topics, tags.`;
};

// ─────────────────────────────────────────────
// チャンク処理
// ─────────────────────────────────────────────

/**
 * 1チャンク分のファイルを AI で一括分類し、結果に応じてファイルを移動する。
 * - メタデータなし かつ 本文が `MIN_CLASSIFIABLE_LENGTH` 未満のファイルは AI をスキップして `FALLBACK_PROJECT` に直接分類する。
 * - AI 呼び出し失敗・JSON パース失敗のどちらもチャンク全件を `FALLBACK_PROJECT` に分類する（エラーをスローしない）。
 * - AI の返答でファイル名が一致しない場合も `FALLBACK_PROJECT` を使用する。
 */
export const processChunk = async (
  chunkMetas: ClassifyChatlogEntry[],
  projects: ProjectDicEntry,
  dryRun: boolean,
  stats: ClassifyStats,
  model: string,
): Promise<void> => {
  const classifiable: ClassifyChatlogEntry[] = [];
  for (const f of chunkMetas) {
    const _fm = f.frontmatter;
    const _title = _fm.get('title');
    const _category = _fm.get('category');
    const _topics = _fm.get('topics');
    const _tags = _fm.get('tags');
    const hasMeta = (typeof _title === 'string' && _title)
      || (typeof _category === 'string' && _category)
      || (Array.isArray(_topics) && _topics.length > 0)
      || (Array.isArray(_tags) && _tags.length > 0);
    const fullLength = (f.frontmatterText + '\n' + f.content).trim().length;
    if (!hasMeta && fullLength < MIN_CLASSIFIABLE_LENGTH) {
      logger.warn(`[skip-ai: too-short] ${f.filename} (content is too short)`);
      logger.info(`  classify: ${f.filename} → fallback:${FALLBACK_PROJECT}`);
      await classifyFile(f, FALLBACK_PROJECT, dryRun, stats);
    } else {
      classifiable.push(f);
    }
  }
  if (classifiable.length === 0) { return; }

  const _batchPrompt = buildClassifyPrompt(classifiable, projects);
  const _systemPrompt = buildSystemPrompt(projects);

  let rawResult: string;
  try {
    rawResult = await runAI(_systemPrompt, _batchPrompt, { model });
  } catch (e) {
    logger.warn(`  claude CLI 実行失敗。チャンク内ファイルをすべて ${FALLBACK_PROJECT} 扱い`);
    logger.warn(`  error: ${e}`);
    for (const f of classifiable) {
      await classifyFile(f, FALLBACK_PROJECT, dryRun, stats);
    }
    return;
  }

  const parsed = parseJsonArray<ClassifyResult>(rawResult);
  if (!parsed) {
    logger.warn(`  JSON パース失敗。チャンク内ファイルをすべて ${FALLBACK_PROJECT} 扱い`);
    logger.warn(`  raw output: ${rawResult.slice(0, 200)}`);
    for (const f of classifiable) {
      await classifyFile(f, FALLBACK_PROJECT, dryRun, stats);
    }
    return;
  }

  for (const fileMeta of classifiable) {
    const result = parsed.find((r) => r.file === fileMeta.filename);
    const project = result?.project ?? FALLBACK_PROJECT;
    logger.info(`  classify: ${fileMeta.filename} → ${project} (conf=${result?.confidence ?? 0})`);
    await classifyFile(fileMeta, project, dryRun, stats);
  }
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * classify-chatlogs スクリプトのエントリポイント。
 * - `--config` で指定された YAML を GlobalConfig に読み込み、model/chunkSize/concurrency のデフォルト値を解決する。
 * - `ChatlogError` はログに出力して `exit(1)` する。その他の例外は再スローする。
 */
export const main = async (argv?: string[]): Promise<void> => {
  try {
    const _parsed = parseArgs(argv ?? Deno.args);
    const _globalConfig = await GlobalConfig.getInstance({ configFile: _parsed.configFile });
    const _config = buildConfig(_parsed, _globalConfig);

    // 入力ディレクトリ確認
    const agentDir = `${_config.inputDir}/${_config.agent}`;
    if (!await dirExists(agentDir)) {
      throw new ChatlogError('InputNotFound', `入力ディレクトリが見つかりません: ${agentDir}`);
    }

    // プロジェクト辞書読み込み
    const projects = await loadProjectDic(_config.projectsDic);
    const _projectNames = Object.keys(projects);
    if (_projectNames.every((name) => name === FALLBACK_PROJECT)) {
      logger.warn('projects.dic にプロジェクトが定義されていません。すべて misc に分類されます。');
    }

    logger.info(`対象 agent: ${_config.agent}`);
    if (_config.period) { logger.info(`対象期間: ${_config.period}`); }
    if (_config.dryRun) { logger.info('dry-run モード: ファイルは移動しません'); }
    logger.info(`プロジェクト候補: ${_projectNames.join(', ')}`);

    // ファイル列挙
    const allFiles = await findEntries(
      [agentDir],
      '.md',
      _config.period ? { include: [_config.period] } : undefined,
    );
    if (allFiles.length === 0) {
      logger.info('対象ファイルなし');
      logger.info('完了: moved=0 skipped=0 error=0');
      return;
    }

    // メタデータ読み込みとスキップ判定
    const targetMetas: ClassifyChatlogEntry[] = [];
    const stats: ClassifyStats = { moved: 0, skipped: 0, error: 0 };

    for (const filePath of allFiles) {
      const meta = await loadClassifyFileMeta(filePath);
      if (!meta) {
        stats.error++;
        continue;
      }
      const _existingProject = meta.frontmatter.get('project');
      if (typeof _existingProject === 'string' && _existingProject) {
        const _srcDir = getDirectory(filePath);
        const _inSubDir = _srcDir.endsWith('/' + _existingProject) || _srcDir.endsWith('\\' + _existingProject);
        if (_inSubDir) {
          logger.info(`  skipped (分類済み: ${_existingProject}): ${meta.filename}`);
          stats.skipped++;
        } else {
          await classifyFile(meta, _existingProject, _config.dryRun, stats);
        }
        continue;
      }
      targetMetas.push(meta);
    }

    logger.info(`\n対象ファイル数: ${targetMetas.length} (スキップ: ${stats.skipped})`);

    if (targetMetas.length === 0) {
      logger.info(`\n完了: moved=${stats.moved} skipped=${stats.skipped} error=${stats.error}`);
      return;
    }

    // チャンク分割して並列処理
    const _chunkSize = _globalConfig.get('chunkSize') as number;
    const _concurrency = _globalConfig.get('concurrency') as number;
    await runChunked(
      targetMetas,
      _chunkSize,
      (chunk) => processChunk(chunk, projects, _config.dryRun, stats, _config.model),
      _concurrency,
    );

    // サマリー
    const drySuffix = _config.dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: moved=${stats.moved} skipped=${stats.skipped} error=${stats.error}`,
    );
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) { await main(); }
