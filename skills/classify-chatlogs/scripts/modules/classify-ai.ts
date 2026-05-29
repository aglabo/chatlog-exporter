// src: scripts/modules/classify-ai.ts
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
import { runChunked } from '../../../_scripts/libs/parallel/concurrency.ts';
import { parseAiJsonArray } from '../../../_scripts/libs/text/json-utils.ts';

// ─── Local
import { ClassifyChatlogEntry } from '../classes/ClassifyChatlogEntry.class.ts';
// types
import type {
  ClassifyBuffer,
  ClassifyConfig,
  ClassifyResult,
  ProjectDicEntry,
} from '../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

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

/**
 * 1チャンク分のファイルを AI で一括分類し、分類バッファを返す。
 * - AI 呼び出し失敗・JSON パース失敗のどちらもチャンク全件を `action: ERROR` エントリとして返す。
 * - AI の返答でファイル名が一致しない場合は `FALLBACK_PROJECT` を使用する。
 * - 副作用（ファイル移動）は行わない。呼び出し元が `applyClassifications` で適用する。
 */
export const processChunk = async (
  chunkMetas: ClassifyChatlogEntry[],
  projects: ProjectDicEntry,
  model: string,
): Promise<ClassifyBuffer> => {
  const _buffer: ClassifyBuffer = [];

  if (chunkMetas.length === 0) { return _buffer; }

  const _batchPrompt = buildClassifyPrompt(chunkMetas, projects);
  const _systemPrompt = buildSystemPrompt(projects);

  let rawResult: string;
  try {
    rawResult = await runAI(_systemPrompt, _batchPrompt, { model });
  } catch (e) {
    const _reason = `claude CLI 実行失敗: ${e}`;
    logger.warn(`  ${_reason}`);
    return chunkMetas.map((f) => ({
      file: f,
      filePath: f.filePath,
      action: CLASSIFY_ACTIONS.ERROR,
      reason: _reason,
    }));
  }

  const parsed = parseAiJsonArray<ClassifyResult>(rawResult);
  if (!parsed) {
    const _reason = `JSON パース失敗: ${rawResult.slice(0, 200)}`;
    logger.warn(`  ${_reason}`);
    return chunkMetas.map((f) => ({
      file: f,
      filePath: f.filePath,
      action: CLASSIFY_ACTIONS.ERROR,
      reason: _reason,
    }));
  }

  for (const fileMeta of chunkMetas) {
    const result = parsed.find((r) => r.file === fileMeta.filename);
    const project = result?.project ?? FALLBACK_PROJECT;
    logger.info(`  classify: ${fileMeta.filename} → ${project} (conf=${result?.confidence ?? 0})`);
    _buffer.push({ file: fileMeta, filePath: fileMeta.filePath, project, action: CLASSIFY_ACTIONS.MOVEBYAI });
  }

  return _buffer;
};

/**
 * 分類バッファを受け取り、REMAINING エントリを AI で分類して分類バッファを返す。
 * - allEntries から `CLASSIFY_ACTIONS.REMAINING` なエントリを抽出して AI 分類する。
 * - REMAINING エントリが 0 件の場合は即座に空配列を返す。
 * - 残りは `runChunked` で並列 AI 分類する。
 * - ファイル移動・stats更新は行わない。
 */
export const classifyByAI = async (
  allEntries: ClassifyBuffer,
  projects: ProjectDicEntry,
  config: Pick<ClassifyConfig, 'chunkSize' | 'concurrency' | 'model'>,
): Promise<ClassifyBuffer> => {
  // `e.file!` は安全: `findBufferEntries` が `action=error` を除外し、REMAINING エントリは常に file を持つ
  const _remaining = allEntries
    .filter((e) => e.action === CLASSIFY_ACTIONS.REMAINING)
    .map((e) => e.file!);
  if (_remaining.length === 0) { return []; }

  const _chunkBuffers = await runChunked<ClassifyChatlogEntry, ClassifyBuffer>(
    _remaining,
    config.chunkSize,
    (chunk) => processChunk(chunk, projects, config.model),
    config.concurrency,
  );

  return _chunkBuffers.flat();
};
