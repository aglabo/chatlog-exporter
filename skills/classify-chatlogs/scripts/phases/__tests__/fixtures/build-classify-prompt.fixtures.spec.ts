// src: scripts/phases/__tests__/fixtures/build-classify-prompt.fixtures.spec.ts
// @(#): buildClassifyPrompt fixtures テスト（純粋関数ベース、AI 不要）
//       対象: buildClassifyPrompt
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildClassifyPrompt } from '../../phase-classify-ai.ts';

// ─── Helpers
// classes
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// types
import type { ProjectDicEntry } from '../../../types/classify.types.ts';
// functions
import {
  findFixtureDirs,
  type IsFixtureDirProvider,
} from '../../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_cle-libs/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { findFiles } from '../../../../../_cle-libs/libs/file-ops/find-files.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
import { loadProjectDic } from '../../../libs/load-project-dic.ts';

// ─── Internal Helpers

// constants
const FIXTURES_DIR = normalizePath(new URL('./fixtures-data/build-classify-prompt', import.meta.url).pathname);

// functions

/** `projects.dic` が存在するディレクトリを fixture ディレクトリと判定する。 */
const _isFixtureDir: IsFixtureDirProvider = async (dir: string): Promise<boolean> => {
  return await fileExists(`${dir}/projects.dic`);
};

/**
 * fixture ディレクトリの `input/` 下の `*.md` ファイルを辞書順で読み込み、
 * `ChatlogEntry[]` を返す。
 *
 * @param dir - fixture ディレクトリの絶対パス
 * @returns `ChatlogEntry` の配列（辞書順）
 */
const _loadInputFiles = async (dir: string): Promise<ChatlogEntry[]> => {
  const _inputDir = `${dir}/input`;
  const _paths = await findFiles(_inputDir, { ext: '.md' });
  return await Promise.all(
    _paths.map(async (filePath) => {
      const _text = await readTextFile(filePath);
      return new ChatlogEntry(_text, { filePath });
    }),
  );
};

/**
 * fixture ディレクトリの `projects.dic` と `expected.txt` を読み込む。
 *
 * @param dir - fixture ディレクトリの絶対パス
 * @returns `{ projects, expected }` のオブジェクト
 */
const _loadProjectsAndExpected = async (
  dir: string,
): Promise<{ projects: ProjectDicEntry; expected: string }> => {
  const projects = await loadProjectDic(`${dir}/projects.dic`);
  const expected = await readTextFile(`${dir}/expected.txt`);
  return { projects, expected };
};

// ─── Tests

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => {
    const _dir = `${FIXTURES_DIR}/${relPath}`;
    const _files = await _loadInputFiles(_dir);
    const projects = await loadProjectDic(`${_dir}/projects.dic`);
    const expected = await readTextFile(`${_dir}/expected.txt`);
    return { relPath, files: _files, projects, expected };
  }),
);

/**
 * `buildClassifyPrompt` の fixtures テストスイート。
 *
 * fixtures-data/build-classify-prompt/ 下の各ディレクトリを読み込み、
 * `input/*.md` から `ChatlogEntry[]` を構築して `buildClassifyPrompt` に渡し、
 * `expected.txt` の期待値と照合する。
 *
 * テスト ID 範囲: SF-CL-BCP-01 〜 SF-CL-BCP-03
 *
 * @see buildClassifyPrompt
 */
describe('buildClassifyPrompt', () => {
  /**
   * fixtures-data/build-classify-prompt/ 下の各 fixture ディレクトリに対して、
   * `buildClassifyPrompt` の出力が期待値と一致することを検証する。
   */
  describe('When: fixtures-data/build-classify-prompt/ 下の各 fixture ディレクトリ', () => {
    for (const { relPath: _relPath, files, projects, expected } of _fixtures) {
      const _testId = _relPath.replace(/\//g, '-');
      it(`[Fixture] SF-CL-BCP-${_testId}: buildClassifyPrompt の出力が expected.txt と一致する`, () => {
        const _result = buildClassifyPrompt(files, projects);

        assertEquals(_result, expected, `出力が一致しない (fixture: ${_relPath})`);
      });
    }
  });
});
