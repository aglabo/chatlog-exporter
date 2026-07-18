// src: scripts/modules/classify-noai.ts
// @(#): classify-chatlogs AI なし事前分類モジュール
//       対象: loadClassifyEntry / preClassify / processPreclassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words noai

// ─── Shared scripts
import { loadChatlogEntry } from '../../../_scripts/libs/file-io/chatlog-entry-loader.ts';
import { isFileIoError } from '../../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { getDirectory } from '../../../_scripts/libs/path-utils/path-utils.ts';

// ─── Local
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { ChatlogCache } from '../../../_scripts/classes/ChatlogCache.class.ts';
import type { ActionStatusEntry } from '../../../_scripts/types/action-status-entry.types.ts';
import type { ClassifyCache } from '../types/classify.types.ts';
// constants
import { ENTRY_ACTIONS, ENTRY_STATUSES } from '../../../_scripts/types/action-status.types.ts';
import { FALLBACK_PROJECT, MIN_CLASSIFIABLE_LENGTH } from '../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../types/classify.types.ts';

/**
 * ファイルを読み込み、分類処理に必要なメタデータを `ActionStatusEntry` として返す。
 * - ファイルシステムエラー（`NotFound`, `PermissionDenied` 等）はそのままスロー（致命的エラー）。
 * - フロントマターの解析エラー（`InvalidFormat`, `InvalidYaml`）は `cache` に `action: ERROR` と `reason` を
 *   書き込んだうえで `options.action: 'error'` のエントリを返す。
 * - 正常時は `entry: ChatlogEntry, options: { filePath }` を持つ `ActionStatusEntry` を返す。
 */
export const loadClassifyEntry = async (
  filePath: string,
  cache: ChatlogCache<ClassifyCache>,
): Promise<ActionStatusEntry> => {
  try {
    const _entry = await loadChatlogEntry(filePath);
    return { entry: _entry, options: { filePath } };
  } catch (e) {
    if (isFileIoError(e) || (e instanceof ChatlogError && e.kind === 'FileDirNotFound')) {
      throw e;
    }
    const _reason = e instanceof Error ? e.message : String(e);
    await cache.write(filePath, { action: CLASSIFY_ACTIONS.ERROR, reason: _reason });
    return {
      entry: new ChatlogEntry('', { filePath }),
      options: { filePath, action: ENTRY_ACTIONS.ERROR, status: ENTRY_STATUSES.ERROR, reason: _reason },
    };
  }
};

/**
 * バッファエントリに対して AI 不要なケースの事前分類を行い、判定結果を `cache` に書き込む。
 * - frontmatter に `project` フィールドがある場合: 既に正しいディレクトリなら `skip`、違うなら `move`
 * - `project` フィールドがなく `hasMeta=false` かつ本文が短い場合: `FALLBACK_PROJECT` に `move`
 * - それ以外: `remaining`（AI 処理対象）
 *
 * 戻り値は常に入力の `entry` をそのまま返す（cache への書き込みが主目的）。
 */
export const preClassify = async (
  entry: ChatlogEntry,
  cache: ChatlogCache<ClassifyCache>,
): Promise<ChatlogEntry> => {
  const f = entry;
  const _fm = f.frontmatter;
  const _existingProject = _fm.get('project');

  // プロジェクト指定済み → 既に正しい場所にあるならスキップ、違う場所にあるなら移動
  if (typeof _existingProject === 'string' && _existingProject) {
    const _srcDir = getDirectory(f.filePath!);
    const _inSubDir = _srcDir.endsWith('/' + _existingProject);
    const _action = _inSubDir ? CLASSIFY_ACTIONS.SKIP : CLASSIFY_ACTIONS.MOVE;
    await cache.write(f.filePath!, { project: _existingProject, action: _action });
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
 * バッファエントリ配列に対して `preClassify` を適用し、各判定結果を `cache` に書き込む。
 */
export const processPreclassify = (
  buffer: ChatlogEntry[],
  cache: ChatlogCache<ClassifyCache>,
): Promise<ChatlogEntry[]> => Promise.all(buffer.map((entry) => preClassify(entry, cache)));
