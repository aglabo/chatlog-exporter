// src: scripts/modules/__tests__/fixtures/build-system-prompt.fixtures.spec.ts
// @(#): buildSystemPrompt fixtures テスト（純粋関数ベース、AI 不要）
//       対象: buildSystemPrompt
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildSystemPrompt } from '../../classify-ai.ts';

// ─── Helpers
// functions
import {
  findFixtureDirs,
  type IsFixtureDirProvider,
} from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';
import { loadProjectDic } from '../../../libs/load-project-dic.ts';

// ─── Internal Helpers

// constants
const FIXTURES_DIR = new URL('./fixtures-data/build-system-prompt', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

// functions

/** `projects.dic` が存在するディレクトリを fixture ディレクトリと判定する。 */
const _isFixtureDir: IsFixtureDirProvider = async (dir: string): Promise<boolean> => {
  return await fileExists(`${dir}/projects.dic`);
};

// ─── Tests

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => {
    const _dir = `${FIXTURES_DIR}/${relPath}`;
    const projects = await loadProjectDic(`${_dir}/projects.dic`);
    const expected = await readTextFile(`${_dir}/expected.txt`);
    return { relPath, projects, expected };
  }),
);

/**
 * `buildSystemPrompt` の fixtures テストスイート。
 *
 * fixtures-data/build-system-prompt/ 下の各ディレクトリを読み込み、
 * `projects.dic` から `ProjectDicEntry` を構築して `buildSystemPrompt` に渡し、
 * `expected.txt` の期待値と照合する。
 *
 * テスト ID 範囲: SF-CL-BSP-01
 *
 * @see buildSystemPrompt
 */
describe('buildSystemPrompt', () => {
  /**
   * fixtures-data/build-system-prompt/ 下の各 fixture ディレクトリに対して、
   * `buildSystemPrompt` の出力が期待値と一致することを検証する。
   */
  describe('When: fixtures-data/build-system-prompt/ 下の各 fixture ディレクトリ', () => {
    for (const { relPath: _relPath, projects, expected } of _fixtures) {
      const _testId = _relPath.replace(/\//g, '-');
      it(`[Fixture] SF-CL-BSP-${_testId}: buildSystemPrompt の出力が expected.txt と一致する`, () => {
        const _result = buildSystemPrompt(projects);

        assertEquals(_result, expected, `出力が一致しない (fixture: ${_relPath})`);
      });
    }
  });
});
