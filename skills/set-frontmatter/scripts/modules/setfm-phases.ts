// src: scripts/modules/setfm-phases.ts
// @(#): set-frontmatter フェーズ処理モジュール
//       対象: judgeType / judgeCategory / generateFrontmatter / reviewFrontmatter /
//             writeFrontmatter
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── External modules
import { parse as parseYaml } from '@std/yaml';

// ─── Shared scripts
import { logger } from '../../../_scripts/libs/io/logger.ts';
import { renderFrontmatter } from '../../../_scripts/libs/text/frontmatter-utils.ts';
import { cleanYaml } from '../../../_scripts/libs/text/markdown-utils.ts';

// ─── Local
import { formatEntryShort, formatEntryWithRules, renderPrompt, runClaude } from './setfm-ai.ts';
// types
import type { Dics } from '../types/dics.types.ts';
import type { EntryMeta } from '../types/entry-meta.types.ts';
import type { FrontmatterResult, LogType, ReviewResult, Stats, TypeResult } from '../types/phase.types.ts';

// ─────────────────────────────────────────────
// Phase 2: type判定（並列）
// ─────────────────────────────────────────────

export const judgeType = async (fm: EntryMeta, dics: Dics): Promise<TypeResult> => {
  const tmpl = dics.prompts.get('type') ?? { system: '', user: '' };
  const typeList = dics.typeEntries.map(formatEntryWithRules).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, { type_list: typeList, body: fm.content });
  let raw: string;
  try {
    raw = await runClaude(system, user);
  } catch {
    return { file: fm.file, type: 'research' };
  }
  const normalized = raw.replace(/\s/g, '').toLowerCase();
  const validKeys = new Set(dics.typeEntries.map((e) => e.key));
  return { file: fm.file, type: validKeys.has(normalized) ? normalized : 'research' };
};

// ─────────────────────────────────────────────
// Phase 3a: category判定（並列）
// ─────────────────────────────────────────────

export const judgeCategory = async (fm: EntryMeta, type: LogType, dics: Dics): Promise<string> => {
  const tmpl = dics.prompts.get('category') ?? { system: '', user: '' };
  const focusGuide = dics.categoryPrompts.get(type) ?? '';
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    category_list: dics.category,
    focus_guide: focusGuide,
    body: fm.content,
  });
  let raw: string;
  try {
    raw = await runClaude(system, user);
  } catch {
    return 'development';
  }
  const normalized = raw.replace(/\s/g, '').toLowerCase();
  const valid = new Set(dics.category.split(','));
  return valid.has(normalized) ? normalized : 'development';
};

// ─────────────────────────────────────────────
// Phase 3b: フロントマター生成（並列）
// ─────────────────────────────────────────────

export const generateFrontmatter = async (
  fm: EntryMeta,
  type: LogType,
  category: string,
  dics: Dics,
): Promise<FrontmatterResult> => {
  const tmpl = dics.prompts.get('meta') ?? { system: '', user: '' };
  const topicList = dics.topicEntries.map(formatEntryWithRules).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    log_type: type,
    log_category: category,
    topic_list: topicList,
    tags_list: dics.tags,
    body: fm.content,
  });
  let raw: string;
  try {
    raw = await runClaude(system, user);
  } catch {
    return { file: fm.file, type, category, yaml: '' };
  }
  return { file: fm.file, type, category, yaml: cleanYaml(raw, 'title') };
};

// ─────────────────────────────────────────────
// Phase 3.5: フロントマターレビュー（並列）
// ─────────────────────────────────────────────

export const reviewFrontmatter = async (
  result: FrontmatterResult,
  dics: Dics,
): Promise<ReviewResult> => {
  const tmpl = dics.prompts.get('review') ?? { system: '', user: '' };
  const typeList = dics.typeEntries.map(formatEntryWithRules).join('\n');
  const topicList = dics.topicEntries.map(formatEntryShort).join('\n');
  const system = renderPrompt(tmpl.system, {});
  const user = renderPrompt(tmpl.user, {
    type_list: typeList,
    topic_list: topicList,
    category_list: dics.category,
    tags_list: dics.tags,
    result_type: result.type,
    result_category: result.category,
    result_yaml: result.yaml,
  });
  let raw: string;
  try {
    raw = await runClaude(system, user);
  } catch {
    return {
      file: result.file,
      validity: 'pass',
      errors: [],
      correctedType: '',
      correctedCategory: '',
      correctedYaml: '',
    };
  }

  const _cleaned = raw.split('\n').filter((l) => !l.startsWith('```')).join('\n').trim();

  const validityMatch = _cleaned.match(/^validity:\s*(pass|fail)/m);
  const validity = (validityMatch?.[1] ?? 'pass') as 'pass' | 'fail';

  if (validity === 'pass') {
    return {
      file: result.file,
      validity: 'pass',
      errors: [],
      correctedType: '',
      correctedCategory: '',
      correctedYaml: '',
    };
  }

  const errorsMatch = _cleaned.match(/^errors:\s*\n((?: {2}- .+\n?)*)/m);
  const errors = errorsMatch
    ? errorsMatch[1].split('\n').map((l) => l.replace(/^ {2}- /, '').trim()).filter(Boolean)
    : [];

  const typeMatch = _cleaned.match(/^ {2}type:\s*(\S+)/m);
  const correctedType = typeMatch?.[1]?.trim() ?? '';

  const categoryMatch = _cleaned.match(/^ {2}category:\s*(\S+)/m);
  const correctedCategory = categoryMatch?.[1]?.trim() ?? '';

  const correctedYaml = _cleaned
    .replace(/^[\s\S]*?(^ {2}title:)/m, '$1')
    .split('\n')
    .map((l) => l.replace(/^ {2}/, ''))
    .join('\n')
    .trim();

  return { file: result.file, validity, errors, correctedType, correctedCategory, correctedYaml };
};

// ─────────────────────────────────────────────
// Phase 4: Markdownへ書き込み
// ─────────────────────────────────────────────

export const writeFrontmatter = async (
  fm: EntryMeta,
  result: FrontmatterResult,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  if (!result.yaml) {
    logger.error(`  FAIL (yaml空): ${fm.file.split(/[/\\]/).pop()}`);
    stats.fail++;
    return;
  }

  const _fields: Record<string, unknown> = {
    session_id: fm.sessionId,
    date: fm.date,
    project: fm.project,
    slug: fm.slug,
    type: result.type,
    category: result.category,
  };
  const _parsedYaml = parseYaml(result.yaml) as Record<string, unknown>;
  const _allFields = { ..._fields, ..._parsedYaml };
  const newFrontmatter = renderFrontmatter(_allFields).trimEnd();

  if (dryRun) {
    logger.log(`\n=== DRY RUN [${result.type}/${result.category}]: ${fm.file.split(/[/\\]/).pop()} ===`);
    logger.log(newFrontmatter);
    stats.success++;
    return;
  }

  const tmpFile = fm.file + '.tmp';
  try {
    await Deno.writeTextFile(tmpFile, newFrontmatter + '\n' + fm.fullBody);
    await Deno.rename(tmpFile, fm.file);
    logger.info(`  OK [${result.type}/${result.category}]: ${fm.file.split(/[/\\]/).pop()}`);
    stats.success++;
  } catch (e) {
    try {
      await Deno.remove(tmpFile);
    } catch { /* ignore */ }
    logger.error(`  FAIL (書き込みエラー): ${fm.file.split(/[/\\]/).pop()}: ${e}`);
    stats.fail++;
  }
};
