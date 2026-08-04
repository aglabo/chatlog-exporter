// src: scripts/phases/__tests__/fixtures/pre-classify.fixtures.spec.ts
// @(#): classifyByNoAI fixtures テスト（純粋関数ベース、AI 不要）
//       対象: classifyByNoAI
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// cspell:words NoAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// ─── Test target
import { classifyByNoAI } from '../../phase-classify-noai.ts';

// ─── Helpers
// types
import type { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import type { FrontmatterFields } from '../../../../../_cle-libs/types/frontmatter.types.ts';
import type { ClassifyAction } from '../../../types/classify.types.ts';
// functions
import {
  findFixtureDirs,
  type IsFixtureDirProvider,
} from '../../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_cle-libs/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../../_cle-libs/libs/file-ops/exists-utils.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// helpers
import { _makeEmptyClassifyCache, _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Internal Helpers

// constants
const FIXTURES_DIR = normalizePath(new URL('./fixtures-data/pre-classify', import.meta.url).pathname);

// types
interface _FixtureInput {
  filePath: string;
  frontmatter: FrontmatterFields;
  content: string;
}

interface _FixtureExpected {
  action?: ClassifyAction;
  project?: string;
}

// functions

/** `input.yaml` が存在するディレクトリを fixture ディレクトリと判定する。 */
const _isFixtureDir: IsFixtureDirProvider = async (dir: string): Promise<boolean> => {
  return await fileExists(`${dir}/input.yaml`);
};

/**
 * input.yaml と expected.yaml を読み込み、fixture データを返す。
 *
 * @param dir - fixture ディレクトリの絶対パス
 * @returns `{ input, expected }` のオブジェクト
 */
const _loadFixture = async (dir: string): Promise<{ input: _FixtureInput; expected: _FixtureExpected }> => {
  const _inputRaw = await readTextFile(`${dir}/input.yaml`);
  const _expectedRaw = await readTextFile(`${dir}/expected.yaml`);
  const input = parseYaml(_inputRaw) as _FixtureInput;
  const expected = parseYaml(_expectedRaw) as _FixtureExpected;
  return { input, expected };
};

/**
 * `_FixtureInput` から `ChatlogEntry` を構築する。
 *
 * frontmatter と content から `ChatlogEntry` を構築する。
 *
 * @param input - `input.yaml` から読み込んだデータ
 * @returns 構築した `ChatlogEntry`
 */
const _buildEntry = (input: _FixtureInput): ChatlogEntry => {
  return _makeEntry(input.filePath, input.frontmatter ?? {}, input.content ?? '');
};

// ─── Tests

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => ({ relPath, ...await _loadFixture(`${FIXTURES_DIR}/${relPath}`) })),
);

/**
 * `classifyByNoAI` の fixtures テストスイート。
 *
 * fixtures-data/pre-classify/ 下の各ディレクトリを読み込み、
 * `input.yaml` から `ChatlogEntry` を構築して `classifyByNoAI` に渡し、
 * `cache` に書き込まれた結果を `expected.yaml` の期待値と照合する。
 *
 * @see classifyByNoAI
 */
describe('classifyByNoAI', () => {
  /**
   * fixtures-data/pre-classify/ 下の各 fixture ディレクトリに対して、
   * `classifyByNoAI` の出力が期待値と一致することを検証する。
   */
  describe('When: fixtures-data/pre-classify/ 下の各 fixture ディレクトリ', () => {
    for (const { relPath: _relPath, input, expected } of _fixtures) {
      const _testId = _relPath.replace(/\//g, '-');
      it(
        `[Fixture] SF-CL-PRE-${_testId}: action=${expected.action ?? '(none)'}${
          expected.project ? `, project=${expected.project}` : ''
        }`,
        async () => {
          const _entry = _buildEntry(input);
          const cache = await _makeEmptyClassifyCache();

          await classifyByNoAI(_entry, cache);

          const _cached = cache.read(input.filePath);
          assertEquals(_cached.action, expected.action, `action が一致しない (fixture: ${_relPath})`);
          if (expected.project !== undefined) {
            assertEquals(_cached.project, expected.project, `project が一致しない (fixture: ${_relPath})`);
          }
        },
      );
    }
  });
});
