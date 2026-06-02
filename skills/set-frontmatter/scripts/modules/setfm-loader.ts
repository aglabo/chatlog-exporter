// src: scripts/modules/setfm-loader.ts
// @(#): set-frontmatter データ読み込みモジュール
//       対象: loadDics / loadPrompts / loadEntryMeta
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── External modules
import { parse as parseYaml } from '@std/yaml';

// ─── Shared scripts
import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../_scripts/classes/ChatlogError.class.ts';
import { readTextFile } from '../../../_scripts/libs/file-io/read-utils.ts';
import { findFiles } from '../../../_scripts/libs/file-ops/find-files.ts';
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { toStringArrayWithNull } from '../../../_scripts/libs/text/string-utils.ts';

// ─── Local
// types
import type { DicEntry, Dics, Prompts, PromptTemplate } from '../types/dics.types.ts';
import type { Stats } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// 辞書読み込み
// ─────────────────────────────────────────────

const _readFileSilent = async (path: string): Promise<string> => {
  try {
    return await readTextFile(path);
  } catch {
    logger.warn(`辞書ファイルが見つかりません: ${path}`);
    return '';
  }
};

const _parseYamlDic = (raw: string): Record<string, unknown> => {
  if (!raw) { return {}; }
  const result = parseYaml(raw);
  return (result && typeof result === 'object') ? (result as Record<string, unknown>) : {};
};

const _extractEntries = (raw: string): DicEntry[] => {
  const parsed = _parseYamlDic(raw);
  return Object.entries(parsed)
    .filter(([, v]) => v !== null && typeof v === 'object')
    .map(([k, v]) => {
      const entry = v as Record<string, unknown>;
      const rulesRaw = entry['rules'] as Record<string, unknown> | undefined;
      return {
        key: k,
        def: (entry['def'] as string | undefined)?.trim() ?? '',
        desc: (entry['desc'] as string | undefined)?.trim() ?? '',
        rules: {
          when: toStringArrayWithNull(rulesRaw?.['when']),
          not: toStringArrayWithNull(rulesRaw?.['not']),
        },
      };
    });
};

const _loadPromptTemplate = (raw: string, name: string): PromptTemplate => {
  const obj = _parseYamlDic(raw);
  const system = typeof obj['system'] === 'string' ? (obj['system'] as string).trim() : '';
  const user = typeof obj['user'] === 'string' ? (obj['user'] as string).trim() : '';
  if (!system || !user) {
    logger.warn(`プロンプトテンプレート "${name}" に system/user キーがありません`);
  }
  return { system, user };
};

export const loadDics = async (dicsDir: string): Promise<Dics> => {
  const [categoryRaw, topicsRaw, tagsRaw, typesRaw] = await Promise.all([
    _readFileSilent(`${dicsDir}/category.dic`),
    _readFileSilent(`${dicsDir}/topics.dic`),
    _readFileSilent(`${dicsDir}/tags.dic`),
    _readFileSilent(`${dicsDir}/types.dic`),
  ]);

  const _category = Object.keys(_parseYamlDic(categoryRaw)).join(',');
  const _tags = Object.keys(_parseYamlDic(tagsRaw)).join(',');

  return {
    category: _category,
    tags: _tags,
    typeEntries: _extractEntries(typesRaw),
    topicEntries: _extractEntries(topicsRaw),
  };
};

export const loadPrompts = async (promptsDir: string): Promise<Prompts> => {
  const [
    categoryRulesRaw,
    typePromptRaw,
    categoryPromptRaw,
    metaPromptRaw,
    reviewPromptRaw,
  ] = await Promise.all([
    _readFileSilent(`${promptsDir}/category-rules.yaml`),
    _readFileSilent(`${promptsDir}/type.yaml`),
    _readFileSilent(`${promptsDir}/category.yaml`),
    _readFileSilent(`${promptsDir}/meta.yaml`),
    _readFileSilent(`${promptsDir}/review.yaml`),
  ]);

  const categoryRulesObj = _parseYamlDic(categoryRulesRaw);
  const _categoryPrompts = new Map<string, string>(
    Object.entries(categoryRulesObj)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, (v as string).trim()]),
  );

  const _prompts = new Map<string, PromptTemplate>([
    ['type', _loadPromptTemplate(typePromptRaw, 'type')],
    ['category', _loadPromptTemplate(categoryPromptRaw, 'category')],
    ['meta', _loadPromptTemplate(metaPromptRaw, 'meta')],
    ['review', _loadPromptTemplate(reviewPromptRaw, 'review')],
  ]);

  return {
    categoryPrompts: _categoryPrompts,
    prompts: _prompts,
  };
};

// ─────────────────────────────────────────────
// ファイルメタ読み込み
// ─────────────────────────────────────────────

export const loadAllEntries = async (
  dir: string,
  maxContentLength: number,
  stats: Stats,
): Promise<ChatlogEntry[]> => {
  const allFiles = await findFiles(dir);
  logger.info(`対象ファイル数: ${allFiles.length}`);
  stats.total = allFiles.length;

  const _entries: ChatlogEntry[] = [];
  for (const filePath of allFiles) {
    const entry = await loadChatlogEntry(filePath, maxContentLength);
    if (!entry) {
      logger.info(`  skip: ${filePath.split(/[/\\]/).pop()}`);
      stats.skip++;
    } else {
      _entries.push(entry);
    }
  }
  return _entries;
};

export const loadChatlogEntry = async (filePath: string, _maxContentLength: number): Promise<ChatlogEntry | null> => {
  let text: string;
  try {
    text = await readTextFile(filePath);
  } catch (e) {
    if (e instanceof ChatlogError && e.kind === 'FileDirNotFound') {
      return null;
    }
    throw e;
  }

  const entry = new ChatlogEntry(text, { filePath });
  const fullBody = entry.content;

  if (!/^#/m.test(fullBody)) { return null; }
  if (!fullBody.trim()) { return null; }

  return entry;
};
