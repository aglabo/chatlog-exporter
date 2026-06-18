// src: scripts/modules/__tests__/fixtures/pre-classify.fixtures.spec.ts
// @(#): preClassify fixtures テスト（純粋関数ベース、AI 不要）
//       対象: preClassify
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
import { preClassify } from '../../classify-noai.ts';

// ─── Helpers
// types
import type { ClassifyAction, ClassifyBufferEntry } from '../../../types/classify.types.ts';
import type { FrontmatterFields } from '../../../../../_scripts/types/frontmatter.types.ts';
// functions
import {
  findFixtureDirs,
  type IsFixtureDirProvider,
} from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';
// helpers
import { _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Internal Helpers

// constants
const FIXTURES_DIR = new URL('./fixtures-data/pre-classify', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

// types
interface _FixtureInput {
  filePath: string;
  frontmatter: FrontmatterFields;
  content: string;
  action?: string;
  reason?: string;
}

interface _FixtureExpected {
  action: ClassifyAction;
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
 * `_FixtureInput` から `ClassifyBufferEntry` を構築する。
 *
 * `action: error` の場合は `file: null` のエントリを返す。
 * それ以外は frontmatter と content から `ClassifyChatlogEntry` を構築する。
 *
 * @param input - `input.yaml` から読み込んだデータ
 * @returns 構築した `ClassifyBufferEntry`
 */
const _buildEntry = (input: _FixtureInput): ClassifyBufferEntry => {
  if (input.action === 'error') {
    return {
      file: null,
      filePath: input.filePath,
      action: 'error',
      reason: input.reason,
    };
  }
  const _entry = _makeEntry(input.filePath, input.frontmatter ?? {}, input.content ?? '');
  return { file: _entry, filePath: input.filePath };
};

// ─── Tests

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => ({ relPath, ...await _loadFixture(`${FIXTURES_DIR}/${relPath}`) })),
);

/**
 * `preClassify` の fixtures テストスイート。
 *
 * fixtures-data/pre-classify/ 下の各ディレクトリを読み込み、
 * `input.yaml` から `ClassifyBufferEntry` を構築して `preClassify` に渡し、
 * `expected.yaml` の期待値と照合する。
 *
 * テスト ID 範囲: SF-CL-PRE-01 〜 SF-CL-PRE-06
 *
 * @see preClassify
 */
describe('preClassify', () => {
  /**
   * fixtures-data/pre-classify/ 下の各 fixture ディレクトリに対して、
   * `preClassify` の出力が期待値と一致することを検証する。
   */
  describe('When: fixtures-data/pre-classify/ 下の各 fixture ディレクトリ', () => {
    for (const { relPath: _relPath, input, expected } of _fixtures) {
      const _testId = _relPath.replace(/\//g, '-');
      it(
        `[Fixture] SF-CL-PRE-${_testId}: action=${expected.action}${
          expected.project ? `, project=${expected.project}` : ''
        }`,
        () => {
          const _entry = _buildEntry(input);

          const _result = preClassify(_entry);

          assertEquals(_result.action, expected.action, `action が一致しない (fixture: ${_relPath})`);
          if (expected.project !== undefined) {
            assertEquals(_result.project, expected.project, `project が一致しない (fixture: ${_relPath})`);
          }
        },
      );
    }
  });
});
