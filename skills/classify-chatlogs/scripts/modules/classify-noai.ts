// src: scripts/modules/classify-noai.ts
// @(#): classify-chatlogs AI なし事前分類モジュール
//       対象: loadClassifyEntry / preClassify / processPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// --- shared modules
// functions
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getDirectory } from '../../../_scripts/libs/path-utils/path-utils.ts';

// --- internal modules ---
// types
import type { ClassifyBufferEntry } from '../types/classify.types.ts';

// classes
import { ClassifyChatlogEntry } from '../classes/ClassifyChatlogEntry.class.ts';

// constants
import { FALLBACK_PROJECT, MIN_CLASSIFIABLE_LENGTH } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * ファイルを読み込み、分類処理に必要なメタデータを `ClassifyBufferEntry` として返す。
 * - ファイルシステムエラー（`NotFound`, `PermissionDenied` 等）はそのままスロー（致命的エラー）。
 * - フロントマターの解析エラー（`InvalidFormat`, `InvalidYaml`）は `action: 'error'` のエントリを返す。
 * - 正常時は `file: entry, filePath` を持つ `ClassifyBufferEntry` を返す。
 */
export const loadClassifyEntry = async (filePath: string): Promise<ClassifyBufferEntry> => {
  const _text = await readTextFile(filePath);
  try {
    const _entry = new ClassifyChatlogEntry(_text, filePath);
    return { file: _entry, filePath };
  } catch (e) {
    const _reason = e instanceof Error ? e.message : String(e);
    return { file: null, filePath, action: CLASSIFY_ACTIONS.ERROR, reason: _reason };
  }
};

/**
 * バッファエントリに対して AI 不要なケースの事前分類を行い、アクションを設定して返す。
 * - `action === 'error'` のエントリはそのまま返す。
 * - frontmatter に `project` フィールドがある場合: 既に正しいディレクトリなら `skip`、違うなら `move`
 * - `project` フィールドがなく `hasMeta=false` かつ本文が短い場合: `FALLBACK_PROJECT` に `move`
 * - それ以外: `remaining`（AI 処理対象）
 */
export const preClassify = (entry: ClassifyBufferEntry): ClassifyBufferEntry => {
  if (entry.action === CLASSIFY_ACTIONS.ERROR) { return entry; }
  const f = entry.file!;
  const _fm = f.frontmatter;
  const _existingProject = _fm.get('project');

  // プロジェクト指定済み → 既に正しい場所にあるならスキップ、違う場所にあるなら移動
  if (typeof _existingProject === 'string' && _existingProject) {
    const _srcDir = getDirectory(f.filePath);
    const _inSubDir = _srcDir.endsWith('/' + _existingProject);
    const _action = _inSubDir ? CLASSIFY_ACTIONS.SKIP : CLASSIFY_ACTIONS.MOVE;
    return { ...entry, project: _existingProject, action: _action };
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
    return { ...entry, project: FALLBACK_PROJECT, action: CLASSIFY_ACTIONS.MOVE };
  }

  return { ...entry, action: CLASSIFY_ACTIONS.REMAINING };
};

/**
 * バッファエントリ配列に対して `preClassify` を適用した結果を返す。
 */
export const processPreclassify = (
  buffer: ClassifyBufferEntry[],
): ClassifyBufferEntry[] => buffer.map(preClassify);
