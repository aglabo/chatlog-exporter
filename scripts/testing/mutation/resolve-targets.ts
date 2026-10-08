// src: scripts/testing/mutation/resolve-targets.ts
// @(#): モジュール名から変異テストのソース集合・テスト集合を導く
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { expandGlob, walk } from 'jsr:@std/fs@^1.0.24';
import { basename, join, relative } from 'jsr:@std/path@^1.1.6';
import { toSlashPath } from '../../../skills/_cle-libs/libs/path-utils/path-utils.ts';
import { buildBaseGlob, SKILL_MODULES } from '../../aplys-tester.ts';
import { REPO_ROOT } from './constants/mutation.constants.ts';
import type { MutateModule, ResolvedTargets, ResolveTargetsOptions } from './types/mutation.types.ts';

export type { MutateModule, ResolvedTargets, ResolveTargetsOptions } from './types/mutation.types.ts';

/** `libs` のソース集合のディレクトリ (リポジトリルート相対)。 */
const _LIBS_SOURCE_DIR = 'skills/_cle-libs';

/**
 * モジュール短縮名から、ソース集合のディレクトリ (リポジトリルート相対) を導く。
 * スキル別名は aplys-tester の別名表 (`SKILL_MODULES`) を引き、別名表を本ファイルに複製しない。
 * `libs` を除くと `module` はスキル別名に絞り込まれるため、型アサーションなしで別名表を引ける。
 *
 * @param module - モジュール短縮名
 * @returns ソース集合のディレクトリ (リポジトリルート相対)
 */
const _sourceDirOf = (module: MutateModule): string =>
  module === 'libs' ? _LIBS_SOURCE_DIR : `skills/${SKILL_MODULES[module]}`;

/** ソース集合から除外するパス (ルート相対・`/` 区切り) の規則 (generation R-102 / DD-03)。 */
const _EXCLUDED_SOURCE_PATTERNS: readonly RegExp[] = [
  /(^|\/)__tests__\//,
  /\.spec\.tsx?$/,
  /\.types\.tsx?$/,
  /\.constants\.tsx?$/,
];

/** テスト集合に入れる spec ファイルの命名 (generation R-104 / DD-02)。 */
const _UNIT_SPEC_PATTERN = /\.spec\.tsx?$/;

/** 変異体の命名 `<stem>.mutation-<NNN>.ts` / `.tsx`。番号は 3 桁以上 (generation R-103 / execution DD-01)。 */
const _MUTANT_NAME_PATTERN = /^.+\.mutation-\d{3,}\.tsx?$/;

/** 一時設定の命名 `deno.mutation-<NNN>.json`。番号は 3 桁以上 (generation R-103 / execution DD-01)。 */
const _TEMP_CONFIG_NAME_PATTERN = /^deno\.mutation-\d{3,}\.json$/;

/**
 * ファイル名が変異体・一時設定の命名に一致するかを判定する。
 *
 * @param fileName - 判定するファイル名
 * @returns 命名に一致するとき `true`
 */
export const isMutationArtifact = (fileName: string): boolean =>
  _MUTANT_NAME_PATTERN.test(fileName) || _TEMP_CONFIG_NAME_PATTERN.test(fileName);

/**
 * ルート配下の 1 ディレクトリを探索し、TypeScript / TSX ファイルをルート相対・`/` 区切りで返す。
 * 除外規則 (`_EXCLUDED_SOURCE_PATTERNS`) に一致するパスは含めない (generation R-102 / DD-03)。
 * 前回の実行が残した変異体・一時設定 (`isMutationArtifact` に一致するファイル名) も含めない (generation R-103 / DD-06)。
 * 探索順はファイルシステムに依存するため、パスの昇順に並べ直す (generation R-105 / DD-07)。
 *
 * @param rootDir - 探索起点 (リポジトリルート)
 * @param dir - 探索するディレクトリ (ルート相対)
 * @returns ルート相対のファイルパス (昇順)
 */
const _collectSources = async (rootDir: string, dir: string): Promise<string[]> => {
  const _files = await Array.fromAsync(walk(join(rootDir, dir), { includeDirs: false, exts: ['.ts', '.tsx'] }));
  return _files
    .map((entry) => toSlashPath(relative(rootDir, entry.path)))
    .filter((path) => !_EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(path)))
    .filter((path) => !isMutationArtifact(basename(path)))
    .toSorted();
};

/**
 * ルート配下から、当該モジュールの unit テストをルート相対・`/` 区切りで返す。
 * glob は aplys-tester のモジュール別 glob (`buildBaseGlob`) を再利用し、aplys-tester が unit として実行する
 * `<base>/unit/**` と `<base>/<group>/unit/**` の 2 形式を探索する。spec ファイル (`*.spec.ts` / `*.spec.tsx`) 以外は除き、
 * 両形式に一致したパスの重複を除いてから、探索順に依存しないようパスの昇順に並べ直す (generation R-104 / DD-02)。
 *
 * @param rootDir - 探索起点 (リポジトリルート)
 * @param module - モジュール短縮名
 * @returns ルート相対のテストファイルパス (昇順・重複なし)
 */
const _collectUnitTests = async (rootDir: string, module: MutateModule): Promise<string[]> => {
  const _baseGlob = buildBaseGlob(module);
  const _globs = [`${_baseGlob}/unit/**/*`, `${_baseGlob}/*/unit/**/*`];
  const _filesPerGlob = await Promise.all(
    _globs.map((glob) => Array.fromAsync(expandGlob(glob, { root: rootDir, includeDirs: false }))),
  );
  const _specs = _filesPerGlob
    .flat()
    .map((entry) => toSlashPath(relative(rootDir, entry.path)))
    .filter((path) => _UNIT_SPEC_PATTERN.test(path));
  return [...new Set(_specs)].toSorted();
};

/**
 * 検査済みのモジュール短縮名から、変異テストのソース集合とテスト集合を導く。
 *
 * @param module - モジュール短縮名 (引数検査は呼び出し側の責務)
 * @param options - 探索オプション
 * @returns ソース集合とテスト集合
 */
export const resolveTargets = async (
  module: MutateModule,
  options: ResolveTargetsOptions = {},
): Promise<ResolvedTargets> => {
  const { rootDir = REPO_ROOT } = options;
  const _sources = await _collectSources(rootDir, _sourceDirOf(module));
  const _tests = await _collectUnitTests(rootDir, module);
  return { sources: _sources, tests: _tests };
};
