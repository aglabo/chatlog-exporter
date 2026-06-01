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
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { toStringArrayWithNull } from '../../../_scripts/libs/text/string-utils.ts';

// ─── Local
// types
import type { DicEntry, Dics, Prompts, PromptTemplate } from '../types/dics.types.ts';
import type { EntryMeta } from '../types/entry-meta.types.ts';

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
// テンプレート変数置換
// ─────────────────────────────────────────────

/**
 * テンプレート内の ${varname} を vars で置換する。
 * varname が [a-z_]+ 以外の場合はエラー終了（インジェクション防止）。
 */
export const renderPrompt = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
    if (!/^[a-z_]+$/.test(name)) {
      throw new ChatlogError('InvalidArgs', 'InvalidSyntax', `不正な変数名 "${name}" — 英小文字と "_" のみ使用可能`);
    }
    if (!(name in vars)) {
      throw new ChatlogError('InvalidArgs', 'NotDefined', `未定義の変数 "${name}"`);
    }
    return vars[name];
  });
};

// ─────────────────────────────────────────────
// 辞書エントリをプロンプト文字列に整形するヘルパー
// ─────────────────────────────────────────────

/** エントリを「- key: def\n  when: ...\n  not: ...」形式に展開 */
export const formatEntryWithRules = (e: DicEntry): string => {
  const lines: string[] = [`- ${e.key}: ${e.def}`];
  if (e.rules.when.length > 0) {
    lines.push(`  when: ${e.rules.when.join(' / ')}`);
  }
  if (e.rules.not.length > 0) {
    lines.push(`  not:  ${e.rules.not.join(' / ')}`);
  }
  return lines.join('\n');
};

/** エントリを「- key: def」形式に展開（rules なし・簡略版） */
export const formatEntryShort = (e: DicEntry): string => {
  return `- ${e.key}: ${e.def}`;
};

// ─────────────────────────────────────────────
// ファイルメタ読み込み
// ─────────────────────────────────────────────

export const loadEntryMeta = async (filePath: string, maxContentLength: number): Promise<EntryMeta | null> => {
  let text: string;
  try {
    text = await readTextFile(filePath);
  } catch {
    return null;
  }

  const entry = new ChatlogEntry(text, { filePath });
  const fullBody = entry.content;

  if (!/^#/m.test(fullBody)) { return null; }
  if (!fullBody.trim()) { return null; }

  const fm = entry.frontmatter;
  const _get = (key: string): string => {
    const v = fm.get(key);
    return typeof v === 'string' ? v : '';
  };

  return {
    file: filePath,
    sessionId: _get('session_id'),
    date: _get('date'),
    project: _get('project'),
    slug: _get('slug'),
    content: entry.truncateContent(maxContentLength),
    fullBody,
  };
};
