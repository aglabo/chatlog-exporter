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
import type { ProjectDicEntry } from '../types/classify.types.ts';
// constants
import { FALLBACK_PROJECT } from '../constants/classify.constants.ts';

/**
 * Converts an unknown `meta` value into a `Record<string, string>` (project property map).
 * Returns an empty object if `meta` is not a plain object (i.e., is null, an array, or a primitive).
 * Properties whose values are not strings are excluded from the result.
 *
 * @param meta - The unknown value to coerce into a string property map.
 * @returns A `Record<string, string>` of string-valued properties, or an empty object if conversion is not possible.
 */
const _toProjectProperty = (meta: unknown): Record<string, string> => {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return {};
  }
  const _result: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (typeof v === 'string') { _result[k] = v; }
  }
  return _result;
};

/**
 * Converts a raw YAML-parsed value into a `ProjectDicEntry`.
 * Returns an empty `ProjectDicEntry` if `parsed` is null, undefined, not an object, or an array.
 * Each top-level key becomes a project name; its value is converted via `_toProjectProperty`.
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
const _FALLBACK_PROJECT_PROPS: Record<string, string> = {
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
