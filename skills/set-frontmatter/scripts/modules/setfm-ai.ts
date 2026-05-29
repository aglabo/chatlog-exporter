// src: scripts/modules/setfm-ai.ts
// @(#): set-frontmatter AI/辞書操作モジュール
//       対象: loadDics / renderPrompt / formatEntryWithRules / formatEntryShort /
//             loadEntryMeta / runClaude
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
import type { DicEntry, Dics, PromptTemplate } from '../types/dics.types.ts';
import type { EntryMeta } from '../types/entry-meta.types.ts';
// constants
import { MAX_BODY_CHARS } from '../constants/entry-meta.constants.ts';

// ─────────────────────────────────────────────
// 辞書読み込み
// ─────────────────────────────────────────────

export const loadDics = async (dicsDir: string): Promise<Dics> => {
  const readFile = async (path: string): Promise<string> => {
    try {
      return await readTextFile(path);
    } catch {
      logger.warn(`辞書ファイルが見つかりません: ${path}`);
      return '';
    }
  };

  const promptsDir = dicsDir.replace(/[/\\]dics$/, '/prompts');

  const [
    categoryRaw,
    topicsRaw,
    tagsRaw,
    typesRaw,
    categoryRulesRaw,
    typePromptRaw,
    categoryPromptRaw,
    metaPromptRaw,
    reviewPromptRaw,
  ] = await Promise.all([
    readFile(`${dicsDir}/category.dic`),
    readFile(`${dicsDir}/topics.dic`),
    readFile(`${dicsDir}/tags.dic`),
    readFile(`${dicsDir}/types.dic`),
    readFile(`${promptsDir}/category-rules.yaml`),
    readFile(`${promptsDir}/type.yaml`),
    readFile(`${promptsDir}/category.yaml`),
    readFile(`${promptsDir}/meta.yaml`),
    readFile(`${promptsDir}/review.yaml`),
  ]);

  const parseYamlDic = (raw: string): Record<string, unknown> => {
    if (!raw) { return {}; }
    const result = parseYaml(raw);
    return (result && typeof result === 'object') ? (result as Record<string, unknown>) : {};
  };

  const extractEntries = (raw: string): DicEntry[] => {
    const parsed = parseYamlDic(raw);
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

  const _category = Object.keys(parseYamlDic(categoryRaw)).join(',');
  const _tags = Object.keys(parseYamlDic(tagsRaw)).join(',');

  const categoryRulesObj = parseYamlDic(categoryRulesRaw);
  const _categoryPrompts = new Map<string, string>(
    Object.entries(categoryRulesObj)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, (v as string).trim()]),
  );

  // プロンプトテンプレート読み込み
  const loadPromptTemplate = (raw: string, name: string): PromptTemplate => {
    const obj = parseYamlDic(raw);
    const system = typeof obj['system'] === 'string' ? (obj['system'] as string).trim() : '';
    const user = typeof obj['user'] === 'string' ? (obj['user'] as string).trim() : '';
    if (!system || !user) {
      logger.warn(`プロンプトテンプレート "${name}" に system/user キーがありません`);
    }
    return { system, user };
  };

  const prompts = new Map<string, PromptTemplate>([
    ['type', loadPromptTemplate(typePromptRaw, 'type')],
    ['category', loadPromptTemplate(categoryPromptRaw, 'category')],
    ['meta', loadPromptTemplate(metaPromptRaw, 'meta')],
    ['review', loadPromptTemplate(reviewPromptRaw, 'review')],
  ]);

  return {
    category: _category,
    tags: _tags,
    typeEntries: extractEntries(typesRaw),
    topicEntries: extractEntries(topicsRaw),
    categoryPrompts: _categoryPrompts,
    prompts,
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

export const loadEntryMeta = async (filePath: string): Promise<EntryMeta | null> => {
  let text: string;
  try {
    text = await readTextFile(filePath);
  } catch {
    return null;
  }

  const entry = new ChatlogEntry(text);
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
    content: fullBody.slice(0, MAX_BODY_CHARS),
    fullBody,
  };
};

// ─────────────────────────────────────────────
// Claude CLI 呼び出し
// ─────────────────────────────────────────────

export const runClaude = async (systemPrompt: string, userPrompt: string): Promise<string> => {
  const cmd = new Deno.Command('claude', {
    args: ['-p', systemPrompt, '--output-format', 'text'],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'null',
  });
  const process = cmd.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(userPrompt));
  await writer.close();
  const output = await process.output();
  if (!output.success) { throw new ChatlogError('CliError', 'ExitFailure', `claude CLI エラー (code=${output.code})`); }
  return new TextDecoder().decode(output.stdout).trim();
};
