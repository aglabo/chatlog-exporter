// src: scripts/modules/classify-meta.ts
// @(#): classify-chatlogs ファイルメタデータ読み込み・事前分類モジュール
//       対象: loadClassifyFileMeta / preClassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/logger/logger.ts';
import { getDirectory } from '../../../_scripts/libs/path-utils/path-utils.ts';
import { ClassifyChatlogEntry } from '../classes/ClassifyChatlogEntry.class.ts';
import { FALLBACK_PROJECT, MIN_CLASSIFIABLE_LENGTH } from '../constants/classify.constants.ts';
import type { ClassifyBuffer } from '../types/classify.types.ts';

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

/**
 * ファイルリストを AI 不要なケースとそれ以外に振り分ける。
 * - frontmatter に `project` フィールドがある場合: 既に正しいディレクトリなら `skip`、違うなら `move`
 * - `project` フィールドがなく `hasMeta=false` かつ本文が短い場合: `FALLBACK_PROJECT` に `move`
 * - それ以外: `remaining` に追加して AI 処理対象とする
 */
export const preClassify = (
  metas: ClassifyChatlogEntry[],
): { buffer: ClassifyBuffer; remaining: ClassifyChatlogEntry[] } => {
  const _buffer: ClassifyBuffer = [];
  const _remaining: ClassifyChatlogEntry[] = [];

  for (const f of metas) {
    const _fm = f.frontmatter;
    const _existingProject = _fm.get('project');

    if (typeof _existingProject === 'string' && _existingProject) {
      const _srcDir = getDirectory(f.filePath);
      const _inSubDir = _srcDir.endsWith('/' + _existingProject)
        || _srcDir.endsWith('\\' + _existingProject);
      const _action = _inSubDir ? 'skip' : 'move';
      _buffer.push({ file: f, project: _existingProject, byAI: false, action: _action });
      continue;
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

    if (!_hasMeta && _fullLength < MIN_CLASSIFIABLE_LENGTH) {
      logger.warn(`[skip-ai: too-short] ${f.filename} (content is too short)`);
      logger.info(`  classify: ${f.filename} → fallback:${FALLBACK_PROJECT}`);
      _buffer.push({ file: f, project: FALLBACK_PROJECT, byAI: false, action: 'move' });
      continue;
    }

    _remaining.push(f);
  }

  return { buffer: _buffer, remaining: _remaining };
};
