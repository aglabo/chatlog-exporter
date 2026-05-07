#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/set-frontmatter.ts
// @(#): チャットログMarkdownにAI生成フロントマターを並列付加する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
/**
 * set_frontmatter.ts — チャットログMarkdownにAI生成フロントマターを並列付加する
 *
 * 使い方:
 *   deno run --allow-read --allow-run --allow-write set_frontmatter.ts <target_dir> [--dry-run] [--no-review] [--concurrency N] [--dics DIR]
 *
 * 処理フロー:
 *   Phase 1: ファイル列挙・メタ読み込み
 *   Phase 2: type判定 (並列)
 *   Phase 3a: category判定 (並列, typeごとの外部プロンプト使用)
 *   Phase 3b: フロントマター生成 (並列, category起点)
 *   Phase 3.5: レビュー・修正 (並列)
 *   Phase 4: Markdownへ書き込み
 */

// cspell:words dics

// -- external --
import { parse as parseYaml } from '@std/yaml';
import { ChatlogError } from '../../_scripts/classes/ChatlogError.class.ts';
import { dirExists } from '../../_scripts/libs/file-io/exists-utils.ts';
import { findFiles } from '../../_scripts/libs/file-io/find-files.ts';
import { readTextFile } from '../../_scripts/libs/file-io/read-utils.ts';
import { logger } from '../../_scripts/libs/io/logger.ts';
import { runConcurrent } from '../../_scripts/libs/parallel/concurrency.ts';
import { parseFrontmatterEntries } from '../../_scripts/libs/text/frontmatter-utils.ts';
import { normalizeLine } from '../../_scripts/libs/text/line-utils.ts';
import { cleanYaml } from '../../_scripts/libs/text/markdown-utils.ts';
import { quoteString, toStringArrayWithNull } from '../../_scripts/libs/text/string-utils.ts';

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

export const DEFAULT_CONCURRENCY = 4;
export const MAX_BODY_CHARS = 4000;

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type LogType = string;

export interface FrontmatterFileMeta {
  file: string; // フルパス
  sessionId: string;
  date: string;
  project: string;
  slug: string;
  content: string; // 本文（4000文字制限）
  fullBody: string; // 本文（無制限、書き込み用）
}

export interface TypeResult {
  file: string;
  type: LogType;
}

export interface FrontmatterResult {
  file: string;
  type: LogType;
  category: string; // Phase 3aで確定したcategory
  yaml: string; // AI生成YAMLブロック（title/summary/topics/tags）
}

export interface ReviewResult {
  file: string;
  validity: 'pass' | 'fail';
  errors: string[];
  correctedType: string; // validity=fail のとき修正後type、pass のとき空文字
  correctedCategory: string; // validity=fail のとき修正後category、pass のとき空文字
  correctedYaml: string; // validity=fail のとき修正後YAML、pass のとき空文字
}

export interface Stats {
  total: number;
  success: number;
  fail: number;
  skip: number;
}

// ─────────────────────────────────────────────
// 辞書エントリ型
// ─────────────────────────────────────────────

export interface DicRules {
  when: string[];
  not: string[];
}

export interface DicEntry {
  key: string;
  def: string;
  desc: string;
  rules: DicRules;
}

export interface PromptTemplate {
  system: string;
  user: string;
}

export interface Dics {
  category: string; // キー一覧（カンマ区切り、スキーマ制約用）
  tags: string; // キー一覧（カンマ区切り、スキーマ制約用）
  typeEntries: DicEntry[];
  topicEntries: DicEntry[];
  categoryPrompts: Map<string, string>; // typeごとのcategory判定プロンプト
  prompts: Map<string, PromptTemplate>; // phase別プロンプトテンプレート
}

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
      throw new ChatlogError('InvalidArgs', `不正な変数名 "${name}" — 英小文字と "_" のみ使用可能`);
    }
    if (!(name in vars)) {
      throw new ChatlogError('InvalidArgs', `未定義の変数 "${name}"`);
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

export const loadFrontmatterFileMeta = async (filePath: string): Promise<FrontmatterFileMeta | null> => {
  let text: string;
  try {
    text = await readTextFile(filePath);
  } catch {
    return null;
  }

  const { meta } = parseFrontmatterEntries(text);

  const rawLines = normalizeLine(text).split('\n');
  const headerIdx = rawLines.findIndex((l) => /^#/.test(l));
  if (headerIdx === -1) { return null; }

  const startIdx = headerIdx > 0 && rawLines[headerIdx - 1].trim() === ''
    ? headerIdx - 1
    : headerIdx;
  const fullBody = rawLines.slice(startIdx).join('\n');
  if (!fullBody.trim()) { return null; }

  return {
    file: filePath,
    sessionId: typeof meta['session_id'] === 'string' ? meta['session_id'] : '',
    date: typeof meta['date'] === 'string' ? meta['date'] : '',
    project: typeof meta['project'] === 'string' ? meta['project'] : '',
    slug: typeof meta['slug'] === 'string' ? meta['slug'] : '',
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
  if (!output.success) { throw new ChatlogError('CliError', `claude CLI エラー (code=${output.code})`); }
  return new TextDecoder().decode(output.stdout).trim();
};

// ─────────────────────────────────────────────
// Phase 2: type判定（並列）
// ─────────────────────────────────────────────

export const judgeType = async (fm: FrontmatterFileMeta, dics: Dics): Promise<TypeResult> => {
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

export const judgeCategory = async (fm: FrontmatterFileMeta, type: LogType, dics: Dics): Promise<string> => {
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
  fm: FrontmatterFileMeta,
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
  fm: FrontmatterFileMeta,
  result: FrontmatterResult,
  dryRun: boolean,
  stats: Stats,
): Promise<void> => {
  if (!result.yaml) {
    logger.error(`  FAIL (yaml空): ${fm.file.split(/[/\\]/).pop()}`);
    stats.fail++;
    return;
  }

  const newFrontmatter = [
    '---',
    `session_id: ${quoteString(fm.sessionId)}`,
    `date: ${quoteString(fm.date)}`,
    `project: ${quoteString(fm.project)}`,
    `slug: ${quoteString(fm.slug)}`,
    `type: ${quoteString(result.type)}`,
    `category: ${quoteString(result.category)}`,
    result.yaml,
    '---',
  ].join('\n');

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

// ─────────────────────────────────────────────
// 引数解析
// ─────────────────────────────────────────────

export interface Args {
  targetDir: string;
  dicsDir: string;
  dryRun: boolean;
  review: boolean;
  concurrency: number;
}

export const parseArgs = (args: string[]): Args => {
  let targetDir = '', dicsDir = './assets/dics', dryRun = false, review = true, concurrency = DEFAULT_CONCURRENCY;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--no-review') {
      review = false;
    } else if (arg === '--dics' && i + 1 < args.length) {
      dicsDir = args[++i];
    } else if (arg.startsWith('--dics=')) {
      dicsDir = arg.slice('--dics='.length);
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      concurrency = parseInt(args[++i], 10) || DEFAULT_CONCURRENCY;
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.slice('--concurrency='.length), 10) || DEFAULT_CONCURRENCY;
    } else if (!arg.startsWith('-')) {
      targetDir = arg;
    } else {
      throw new ChatlogError('InvalidArgs', `不明なオプション: ${arg}`);
    }
  }
  if (!targetDir) {
    throw new ChatlogError(
      'InvalidArgs',
      'Usage: set_frontmatter.ts <target_dir> [--dry-run] [--no-review] [--concurrency N] [--dics DIR]',
    );
  }
  return { targetDir, dicsDir, dryRun, review, concurrency };
};

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

export const main = async (args: string[]): Promise<void> => {
  try {
    const { targetDir, dicsDir, dryRun, review, concurrency } = parseArgs(args);

    if (!await dirExists(targetDir)) {
      throw new ChatlogError('InputNotFound', `ディレクトリが見つかりません: ${targetDir}`);
    }

    const dics = await loadDics(dicsDir);
    logger.info(
      `辞書読み込み完了: category=${dics.category.split(',').length}件 `
        + `topics=${dics.topicEntries.length}件 tags=${dics.tags.split(',').length}件 `
        + `types=${dics.typeEntries.length}件`,
    );

    const allFiles = await findFiles(targetDir);
    logger.info(`対象ファイル数: ${allFiles.length}`);
    if (dryRun) { logger.info('dry-run モード: ファイルは更新しません'); }
    if (!review) { logger.info('--no-review モード: Phase 3.5 をスキップします'); }
    if (allFiles.length === 0) {
      logger.info('対象ファイルなし');
      return;
    }

    // Phase 1: メタ読み込み
    const fileMetaList: FrontmatterFileMeta[] = [];
    const stats: Stats = { total: allFiles.length, success: 0, fail: 0, skip: 0 };
    for (const filePath of allFiles) {
      const fm = await loadFrontmatterFileMeta(filePath);
      if (!fm) {
        logger.info(`  skip: ${filePath.split(/[/\\]/).pop()}`);
        stats.skip++;
      } else { fileMetaList.push(fm); }
    }
    logger.info(`メタ読み込み: ${fileMetaList.length}件（スキップ: ${stats.skip}件）`);

    // Phase 2: type判定（並列）
    logger.info(`\nPhase 2: type判定開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const typeResults = await runConcurrent(fileMetaList, (fm) => judgeType(fm, dics), concurrency);
    const typeMap = new Map(typeResults.map((r) => [r.file, r]));
    for (const r of typeResults) { logger.info(`  type [${r.type}]: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3a: category判定（並列）
    logger.info(`\nPhase 3a: category判定開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const categoryResults = await runConcurrent(
      fileMetaList,
      async (fm) => {
        const type = typeMap.get(fm.file)?.type ?? 'research';
        const category = await judgeCategory(fm, type, dics);
        logger.info(`  category [${category}]: ${fm.file.split(/[/\\]/).pop()}`);
        return { file: fm.file, type, category };
      },
      concurrency,
    );
    const categoryMap = new Map(categoryResults.map((r) => [r.file, r]));

    // Phase 3b: フロントマター生成（並列）
    logger.info(`\nPhase 3b: フロントマター生成開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
    const fmResults = await runConcurrent(
      fileMetaList,
      (fm) => {
        const cr = categoryMap.get(fm.file);
        const type = cr?.type ?? 'research';
        const category = cr?.category ?? 'development';
        return generateFrontmatter(fm, type, category, dics);
      },
      concurrency,
    );
    const fmResultMap = new Map(fmResults.map((r) => [r.file, r]));
    for (const r of fmResults) { logger.info(`  generated: ${r.file.split(/[/\\]/).pop()}`); }

    // Phase 3.5: レビュー（並列）
    if (review) {
      logger.info(`\nPhase 3.5: フロントマターレビュー開始 (${fileMetaList.length}件 × 並列度${concurrency})`);
      const reviewResults = await runConcurrent(
        fmResults.filter((r) => r.yaml),
        (r) => reviewFrontmatter(r, dics),
        concurrency,
      );
      for (const r of reviewResults) {
        if (r.validity === 'fail') {
          logger.warn(`  review FAIL: ${r.file.split(/[/\\]/).pop()} — ${r.errors.join('; ')}`);
          const fm = fmResultMap.get(r.file);
          if (fm) {
            fmResultMap.set(r.file, {
              ...fm,
              type: r.correctedType || fm.type,
              category: r.correctedCategory || fm.category,
              yaml: r.correctedYaml || fm.yaml,
            });
          }
        } else {
          logger.info(`  review OK: ${r.file.split(/[/\\]/).pop()}`);
        }
      }
    } else {
      logger.info(`\nPhase 3.5: スキップ (--no-review)`);
    }

    // Phase 4: 書き込み
    logger.info(`\nPhase 4: Markdownへ書き込み`);
    for (const fm of fileMetaList) {
      const result = fmResultMap.get(fm.file);
      if (!result) {
        stats.fail++;
        continue;
      }
      await writeFrontmatter(fm, result, dryRun, stats);
    }

    const drySuffix = dryRun ? ' (dry-run)' : '';
    logger.info(
      `\n完了${drySuffix}: total=${stats.total} success=${stats.success} fail=${stats.fail} skip=${stats.skip}`,
    );
  } catch (e) {
    if (e instanceof ChatlogError) {
      logger.error(e.message);
      Deno.exit(1);
    }
    throw e;
  }
};

if (import.meta.main) {
  await main(Deno.args);
}
