// src: scripts/modules/setfm-assets-loader.ts
// @(#): set-frontmatter assets/ 配下の静的アセット（辞書・プロンプト）読み込みモジュール
//       対象: loadDics / loadPrompts / resolveDicsDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words setfm

// ─── External modules
import { parse as parseYaml } from 'jsr:@std/yaml@^1.0.12';

// ─── Shared scripts
import { readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { logger } from '../../../_cle-libs/libs/io/logger.ts';
import { resolveConfigPath } from '../../../_cle-libs/libs/path-utils/resolve-path.ts';
import { toStringArrayWithNull, toStringWithNull } from '../../../_cle-libs/libs/text/string-utils.ts';
// classes
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../_cle-libs/classes/GlobalConfig.class.ts';

// ─── Local
// types
import type { DicEntry, DicRules, Dics, Prompts, PromptTemplate } from '../types/dics.types.ts';

// ─────────────────────────────────────────────
// 辞書読み込み
// ─────────────────────────────────────────────

const _readAssetFile = async (path: string): Promise<string> => {
  try {
    return await readTextFile(path);
  } catch (e) {
    if (e instanceof ChatlogError && e.kind === 'FileDirNotFound') {
      logger.warn(`アセットファイルが見つかりません: ${path}`);
      return '';
    }
    throw e;
  }
};

const _parseYamlDic = (raw: string): Record<string, unknown> => {
  if (!raw) { return {}; }
  const result = parseYaml(raw);
  return (result && typeof result === 'object') ? (result as Record<string, unknown>) : {};
};

const _extractRules = (rulesRaw: Record<string, unknown> | undefined): DicRules => {
  if (!rulesRaw) { return {}; }
  return Object.fromEntries(
    Object.entries(rulesRaw)
      .map(([k, v]) => [k, toStringArrayWithNull(v)])
      .filter(([, v]) => v !== null),
  ) as DicRules;
};

const _extractEntries = (raw: string): DicEntry[] => {
  const parsed = _parseYamlDic(raw);
  return Object.entries(parsed)
    .filter(([, v]) => v !== null && typeof v === 'object')
    .map(([k, v]) => {
      const entry = v as Record<string, unknown>;
      return {
        key: k,
        def: toStringWithNull(entry['def']).trim(),
        desc: toStringWithNull(entry['desc']).trim(),
        rules: _extractRules(entry['rules'] as Record<string, unknown> | undefined),
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

/**
 * 辞書ディレクトリを解決する。
 *
 * 絶対パスは正規化してそのまま返し、相対パスは `.config/<appName>/` 基準に解決する。
 * `loadDics` の読み込み先と、起動時検査のエラーメッセージに使う辞書パスを一致させるために公開する。
 *
 * @param dicsDir - 設定・引数で指定された辞書ディレクトリ
 * @returns 解決済みの辞書ディレクトリ
 */
export const resolveDicsDir = (dicsDir: string): string =>
  resolveConfigPath({
    configPath: dicsDir,
    defaultPath: dicsDir,
    config: GlobalConfig.getInstance(),
  });

export const loadDics = async (dicsDir: string): Promise<Dics> => {
  const _resolvedDicsDir = resolveDicsDir(dicsDir);
  const [categoryRaw, topicsRaw, tagsRaw, typesRaw] = await Promise.all([
    _readAssetFile(`${_resolvedDicsDir}/category.dic`),
    _readAssetFile(`${_resolvedDicsDir}/topics.dic`),
    _readAssetFile(`${_resolvedDicsDir}/tags.dic`),
    _readAssetFile(`${_resolvedDicsDir}/types.dic`),
  ]);

  const _category = Object.keys(_parseYamlDic(categoryRaw)).join(',');
  const _tags = Object.keys(_parseYamlDic(tagsRaw)).join(',');

  return {
    category: _category,
    tags: _tags,
    categoryEntries: _extractEntries(categoryRaw),
    typeEntries: _extractEntries(typesRaw),
    topicEntries: _extractEntries(topicsRaw),
  };
};

export const loadPrompts = async (promptsDir: string): Promise<Prompts> => {
  const _resolvedPromptsDir = resolveConfigPath({
    configPath: promptsDir,
    defaultPath: promptsDir,
    config: GlobalConfig.getInstance(),
  });
  const [
    categoryRulesRaw,
    typePromptRaw,
    categoryPromptRaw,
    typeCategoryPromptRaw,
    metaPromptRaw,
    reviewPromptRaw,
  ] = await Promise.all([
    _readAssetFile(`${_resolvedPromptsDir}/category-rules.yaml`),
    _readAssetFile(`${_resolvedPromptsDir}/type.yaml`),
    _readAssetFile(`${_resolvedPromptsDir}/category.yaml`),
    _readAssetFile(`${_resolvedPromptsDir}/type-category.yaml`),
    _readAssetFile(`${_resolvedPromptsDir}/meta.yaml`),
    _readAssetFile(`${_resolvedPromptsDir}/review.yaml`),
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
    ['type-category', _loadPromptTemplate(typeCategoryPromptRaw, 'type-category')],
    ['meta', _loadPromptTemplate(metaPromptRaw, 'meta')],
    ['review', _loadPromptTemplate(reviewPromptRaw, 'review')],
  ]);

  return {
    categoryPrompts: _categoryPrompts,
    prompts: _prompts,
  };
};
