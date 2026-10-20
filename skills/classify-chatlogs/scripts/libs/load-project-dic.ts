// src: scripts/libs/load-project-dic.ts
// @(#): プロジェクト辞書 YAML を読み込み ProjectDicEntry に変換する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── External modules
import { parse as parseYaml } from 'jsr:@std/yaml@^1.0.12';

// ─── Shared scripts
import { ChatlogError } from '../../../_cle-libs/classes/ChatlogError.class.ts';
import { readTextFile } from '../../../_cle-libs/libs/file-io/read-utils.ts';
import { resolveConfigPath } from '../../../_cle-libs/libs/path-utils/resolve-path.ts';

// ─── Local
// types
import type { ProjectDicEntry, ProjectProps, ProjectRules } from '../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';

/**
 * Returns whether `value` is a plain object (not null, not an array, not a primitive).
 *
 * @param value - The unknown value to test.
 * @returns `true` if `value` can be read as a `Record<string, unknown>`.
 */
const _isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Builds a single-key `ProjectRules` fragment for a rule condition list.
 * Returns an empty object when `value` is not an array, so the key is omitted from the result.
 * Non-string elements are dropped from the array; an array left with no elements is kept as `[]`.
 *
 * @param key - The rule key (`when` or `not`).
 * @param value - The raw value read from the YAML `rules` object.
 * @returns `{ [key]: <string elements of value> }` if `value` is an array, otherwise `{}`.
 */
const _toRuleEntry = (key: keyof ProjectRules, value: unknown): ProjectRules =>
  Array.isArray(value) ? { [key]: value.filter((item): item is string => typeof item === 'string') } : {};

/**
 * Converts a plain `rules` object into `ProjectRules`.
 * Only `when` and `not` are taken; unknown keys are dropped.
 * An empty `rules` object yields `{}`.
 *
 * @param rules - The plain object read from the YAML `rules` property.
 * @returns A `ProjectRules` holding only the valid `when` / `not` lists.
 */
const _toProjectRules = (rules: Record<string, unknown>): ProjectRules => ({
  ..._toRuleEntry('when', rules.when),
  ..._toRuleEntry('not', rules.not),
});

/**
 * Converts an unknown `meta` value into `ProjectProps` (project property map).
 * Returns an empty object if `meta` is not a plain object (i.e., is null, an array, or a primitive).
 * String-valued properties are kept; other non-string properties are excluded.
 * The `rules` key is never kept as a string property: it is converted via `_toProjectRules`
 * when it is a plain object, and omitted otherwise (array, null, string, etc.).
 *
 * @param meta - The unknown value to coerce into a project property map.
 * @returns A `ProjectProps` of string-valued properties plus optional `rules`, or an empty object if conversion is not possible.
 */
const _toProjectProperty = (meta: unknown): ProjectProps => {
  if (!_isPlainObject(meta)) {
    return {};
  }
  const { rules, ...props } = meta;
  const _stringProps: ProjectProps = Object.fromEntries(
    Object.entries(props).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  return _isPlainObject(rules) ? { ..._stringProps, rules: _toProjectRules(rules) } : _stringProps;
};

/**
 * Converts a raw YAML-parsed value into a `ProjectDicEntry`.
 * Returns an empty `ProjectDicEntry` if `parsed` is null, undefined, not an object, or an array.
 * Each top-level key becomes a project name; its value is converted via `_toProjectProperty`,
 * which keeps string properties and the nested `rules` (`when` / `not`) of each project.
 *
 * @param parsed - The raw value produced by parsing YAML content.
 * @returns A `ProjectDicEntry` built from `parsed`, or an empty object if conversion is not applicable.
 */
export const _parseProjectDic = (parsed: unknown): ProjectDicEntry => {
  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const _result: ProjectDicEntry = {};
  for (const [name, meta] of Object.entries(parsed as Record<string, unknown>)) {
    _result[name] = _toProjectProperty(meta);
  }
  return _result;
};

/**
 * Default properties for the fallback project (`FALLBACK_PROJECT`).
 * Used when the project dictionary does not contain an entry for the fallback project.
 */
const _FALLBACK_PROJECT_PROPS: ProjectProps = {
  def: 'Miscellaneous logs that do not belong to any specific project',
  category: 'casual',
  desc: '特定プロジェクトに属さない雑多なログ。日常的な質問・技術外の相談・一時的な調査',
};

/**
 * Ensures the fallback project entry always exists in the dictionary.
 * Non-fallback entries are preserved as-is.
 * If the fallback project is already present, its properties are kept unchanged;
 * otherwise, `_FALLBACK_PROJECT_PROPS` is used as the default properties.
 *
 * @param dic - The project dictionary to normalize.
 * @returns A new `ProjectDicEntry` with the fallback project guaranteed to be present.
 */
const _ensureFallbackProject = (dic: ProjectDicEntry): ProjectDicEntry => {
  const _nonFallback = Object.fromEntries(
    Object.entries(dic).filter(([name]) => name !== FALLBACK_PROJECT),
  );
  const fallbackProps = FALLBACK_PROJECT in dic ? dic[FALLBACK_PROJECT] : _FALLBACK_PROJECT_PROPS;
  return { ..._nonFallback, [FALLBACK_PROJECT]: fallbackProps };
};

/**
 * Loads and parses the project dictionary YAML file.
 * Resolves the file path using `resolveProvider`, reads the content via `readProvider`,
 * parses the YAML, and returns a `ProjectDicEntry` with the fallback project guaranteed to be present.
 * If the YAML content is empty or null, returns a dictionary containing only the fallback project.
 *
 * @param filePath - Path to the project dictionary YAML file. Defaults to `${DEFAULT_CONFIG_DIR}/projects.dic` if omitted.
 * @param resolveProvider - Path resolver function (injectable for testing). Defaults to `resolveConfigPath`.
 * @param readProvider - File reader function (injectable for testing). Defaults to `readTextFile`.
 * @returns A promise resolving to the parsed `ProjectDicEntry` with the fallback project entry guaranteed.
 * @throws {ChatlogError} With kind `'FileDirNotFound'` if the resolved path does not exist.
 * @throws {ChatlogError} With kind `'GitNotFound'` if the git command is not found when resolving the project root.
 * @throws {ChatlogError} With kind `'InvalidYaml'` if the YAML content has a syntax error.
 * @throws {Deno.errors.PermissionDenied} If the process lacks read or run permission.
 */
export const loadProjectDic = async (
  filePath?: string,
  resolveProvider: typeof resolveConfigPath = resolveConfigPath,
  readProvider: typeof readTextFile = readTextFile,
): Promise<ProjectDicEntry> => {
  const _resolved = resolveProvider({
    configPath: filePath,
    defaultPath: `dics/projects.dic`,
  });

  const text = await readProvider(_resolved);
  let _parsed: unknown;
  try {
    _parsed = parseYaml(text);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', `YAML 構文エラー: ${e.message}`);
    }
    throw e;
  }
  if (_parsed === null || _parsed === undefined) {
    return { [FALLBACK_PROJECT]: _FALLBACK_PROJECT_PROPS };
  }
  return _ensureFallbackProject(_parseProjectDic(_parsed));
};
