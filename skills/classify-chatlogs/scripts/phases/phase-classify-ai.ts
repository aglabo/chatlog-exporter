// src: scripts/phases/phase-classify-ai.ts
// @(#): classify-chatlogs AI プロンプト構築・AI 分類処理モジュール
//       対象: buildClassifyPrompt / buildSystemPrompt / processChunk / classifyFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words MoveByAI

// ─── Shared scripts
import { runAI } from '../../../_scripts/libs/ai/run-ai.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { runChunked, runConcurrent } from '../../../_scripts/libs/parallel/concurrency.ts';
import { parseAiJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// ─── Local
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
// types
import type {
  ClassifyCache,
  ClassifyConfig,
  ProjectDicEntry,
} from '../types/classify.types.ts';
// constants
import { LOGGER_TEXT } from '../../../_scripts/constants/logger.constants.ts';
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * AI へ渡すバッチ分類プロンプトを構築する。
 * - メタデータ（title/category/topics/tags）がすべて空のファイルは、本文先頭 500 文字を `body:` として付加する。
 */
export const buildClassifyPrompt = (files: ChatlogEntry[], projects: ProjectDicEntry): string => {
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

/** チャンク全件に `action: ERROR` を `cache` へ書き込み、処理した filePath 一覧を返す。 */
const _writeChunkError = async (
  chunkMetas: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
  reason: string,
): Promise<string[]> => {
  await Promise.all(
    chunkMetas.map((f) => cache.write(f.filePath!, { action: CLASSIFY_ACTIONS.ERROR, reason })),
  );
  return chunkMetas.map((f) => f.filePath!);
};

/**
 * 1チャンク分のファイルを AI で一括分類し、判定結果を `cache` に書き込む。
 * - AI 呼び出し失敗・JSON パース失敗のどちらもチャンク全件を `action: ERROR` として `cache` に書き込む。
 * - AI の返答でファイル名が一致しない場合は `FALLBACK_PROJECT` を使用する。
 * - 副作用（ファイル移動）は行わない。判定結果はすべて `cache.write()` に記録する。
 *
 * @returns 処理した filePath 一覧
 */
export const processChunk = async (
  chunkMetas: ChatlogEntry[],
  projects: ProjectDicEntry,
  model: string,
  cache: ChatlogCache<ClassifyCache>,
): Promise<string[]> => {
  if (chunkMetas.length === 0) { return []; }

  const _batchPrompt = buildClassifyPrompt(chunkMetas, projects);
  const _systemPrompt = buildSystemPrompt(projects);

  let rawResult: string;
  try {
    rawResult = await runAI(_systemPrompt, _batchPrompt, { model });
  } catch (e) {
    const _reason = `claude CLI 実行失敗: ${e}`;
    logger.warn(`${LOGGER_TEXT.INDENT}${_reason}`);
    return _writeChunkError(chunkMetas, cache, _reason);
  }

  const parsed = parseAiJsonArray<ClassifyCache>(rawResult);
  if (!parsed) {
    const _reason = `JSON パース失敗: ${rawResult.slice(0, 200)}`;
    logger.warn(`${LOGGER_TEXT.INDENT}${_reason}`);
    return _writeChunkError(chunkMetas, cache, _reason);
  }

  await Promise.all(chunkMetas.map((fileMeta) => {
    const result = parsed.find((r) => r.file === fileMeta.filename);
    const project = result?.project ?? FALLBACK_PROJECT;
    logger.info(`${LOGGER_TEXT.INDENT}classify: ${fileMeta.filename} → ${project} (conf=${result?.confidence ?? 0})`);
    return cache.write(fileMeta.filePath!, {
      project,
      confidence: result?.confidence ?? 0,
      reason: result?.reason ?? '',
      action: CLASSIFY_ACTIONS.MOVEBYAI,
    });
  }));

  return chunkMetas.map((f) => f.filePath!);
};

/**
 * 分類対象のファイルエントリを AI で分類し、判定結果を `cache` に書き込む。
 * - `targets` が 0 件の場合は即座に return する。
 * - `dryRun === true` の場合は AI 呼び出しを行わず、`targets` 全件に `action: SKIP` を書き込んで return する
 *   （`project` は未設定のまま。次回実行時は uncached として再度 AI 分類対象になる）。
 * - `dryRun === false` の場合は `runChunked` で並列 AI 分類する。
 * - ファイル移動・stats更新は行わない。判定結果はすべて `processChunk` 経由で `cache` に記録する。
 */
export const classifyByAI = async (
  targets: ChatlogEntry[],
  projects: ProjectDicEntry,
  config: Pick<ClassifyConfig, 'chunkSize' | 'concurrency' | 'model'>,
  cache: ChatlogCache<ClassifyCache>,
  dryRun: boolean,
): Promise<void> => {
  if (targets.length === 0) { return; }

  if (dryRun) {
    await runConcurrent(
      targets,
      (f) => cache.write(f.filePath!, { action: CLASSIFY_ACTIONS.SKIP }),
      config.concurrency,
    );
    logger.dryrun(`AI 分類をスキップします（project は設定されません）: ${targets.length}件`);
    return;
  }

  await runChunked<ChatlogEntry, string[]>(
    targets,
    config.chunkSize,
    (chunk) => processChunk(chunk, projects, config.model, cache),
    config.concurrency,
  );
};
