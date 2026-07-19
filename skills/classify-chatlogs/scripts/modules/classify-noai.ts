// src: scripts/modules/classify-noai.ts
// @(#): classify-chatlogs AI なし事前分類モジュール
//       対象: classifyByNoAI / processClassifyNoAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// ─── Shared scripts
import { logger } from '../../../_scripts/libs/io/logger.ts';

// ─── Local
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache } from '../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT, MIN_CLASSIFIABLE_LENGTH } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * バッファエントリに対して AI 不要なケースの事前分類を行い、判定結果を `cache` に書き込む。
 * - frontmatter に `project` フィールドがある場合: `move`
 * - `project` フィールドがなく `hasMeta=false` かつ本文が短い場合: `FALLBACK_PROJECT` に `move`
 * - それ以外: `remaining`（AI 処理対象）
 *
 * 戻り値は常に入力の `entry` をそのまま返す（cache への書き込みが主目的）。
 */
export const classifyByNoAI = async (
  entry: ChatlogEntry,
  cache: ChatlogCache<ClassifyCache>,
): Promise<ChatlogEntry> => {
  const f = entry;
  const _fm = f.frontmatter;
  const _existingProject = _fm.get('project');

  // プロジェクト指定済み → 移動
  if (typeof _existingProject === 'string' && _existingProject) {
    await cache.write(f.filePath!, { project: _existingProject, action: CLASSIFY_ACTIONS.MOVE });
    return entry;
  }

  const _title = _fm.get('title');
  const _category = _fm.get('category');
  const _topics = _fm.get('topics');
  const _tags = _fm.get('tags');
  const _hasMeta = (typeof _title === 'string' && _title)
    || (typeof _category === 'string' && _category)
    || (Array.isArray(_topics) && _topics.length > 0)
    || (Array.isArray(_tags) && _tags.length > 0);
  const _fullLength = (f.frontmatterText + '\n' + f.content).trim().length;

  // メタ情報がなく内容も短い → fallback プロジェクトに移動
  if (!_hasMeta && _fullLength < MIN_CLASSIFIABLE_LENGTH) {
    logger.warn(`[skip-ai: too-short] ${f.filename} (content is too short)`);
    logger.info(`  classify: ${f.filename} → fallback:${FALLBACK_PROJECT}`);
    await cache.write(f.filePath!, { project: FALLBACK_PROJECT, action: CLASSIFY_ACTIONS.MOVE });
    return entry;
  }

  await cache.write(f.filePath!, { action: CLASSIFY_ACTIONS.REMAINING });
  return entry;
};

/**
 * バッファエントリ配列に対して `classifyByNoAI` を適用し、各判定結果を `cache` に書き込んだ上で、
 * AI 分類が不要な確定済みエントリ（`move`）と AI 分類が必要なエントリ（`remaining`）に分割する。
 */
export const processClassifyNoAI = async (
  buffer: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
): Promise<{ move: ChatlogEntry[]; remaining: ChatlogEntry[] }> => {
  await Promise.all(buffer.map((entry) => classifyByNoAI(entry, cache)));
  const move = buffer.filter((entry) => cache.read(entry.filePath!).action !== CLASSIFY_ACTIONS.REMAINING);
  const remaining = buffer.filter((entry) => cache.read(entry.filePath!).action === CLASSIFY_ACTIONS.REMAINING);
  return { move, remaining };
};
