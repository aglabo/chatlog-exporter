// src: skills/_scripts/classes/__tests__/fixtures/to-frontmatter.fixtures.spec.ts
// @(#): ChatlogFrontmatter.toFrontmatter() fixtures テスト
//       fixtures-data/to-frontmatter/ 下の各ディレクトリをスキャンし
//       input.md を処理し、expected.md の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// -- helpers --
import { findFixtureDirs } from '../../../__tests__/helpers/find-fixture-dirs.ts';
// types
import type { IsFixtureDirProvider } from '../../../__tests__/helpers/find-fixture-dirs.ts';
// exists
import { fileExists } from '../../../libs/file-io/exists-utils.ts';
import { readTextFile } from '../../../libs/file-io/read-utils.ts';

// -- error class --
import { ChatlogError } from '../../ChatlogError.class.ts';

// -- test target --
import { ChatlogFrontmatter } from '../../ChatlogFrontmatter.class.ts';

// ─────────────────────────────────────────────
// toFrontmatter — ファイルベース fixtures
// ─────────────────────────────────────────────

interface _FixtureConfig {
  fieldOrder: string[];
}

type _FixtureExpected =
  | { expected: string; error?: never }
  | { error: string; expected?: never };

const FIXTURES_DIR = new URL('./fixtures-data/to-frontmatter', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

const _isFixtureDir: IsFixtureDirProvider = async (dir) => {
  return await fileExists(`${dir}/input.md`) && await fileExists(`${dir}/config.yaml`);
};

async function _loadFixture(
  dir: string,
): Promise<{ input: string; fieldOrder: string[]; expected: _FixtureExpected }> {
  const input = await readTextFile(`${dir}/input.md`);
  const configRaw = await readTextFile(`${dir}/config.yaml`);
  const config = parseYaml(configRaw) as _FixtureConfig;
  let fixtureExpected: _FixtureExpected;
  try {
    const raw = await readTextFile(`${dir}/expected.yaml`);
    fixtureExpected = parseYaml(raw) as _FixtureExpected;
  } catch {
    const expectedText = await readTextFile(`${dir}/expected.md`);
    fixtureExpected = { expected: expectedText };
  }
  return { input, fieldOrder: config.fieldOrder, expected: fixtureExpected };
}

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => ({ relPath, ...await _loadFixture(`${FIXTURES_DIR}/${relPath}`) })),
);

describe('toFrontmatter', () => {
  describe('Given: fixtures-data/to-frontmatter/ 下の各 fixture ディレクトリ', () => {
    describe('When: toFrontmatter(fieldOrder) を呼び出す', () => {
      describe('Then: expected.md と一致する', () => {
        for (const { relPath: _relPath, input, fieldOrder, expected } of _fixtures) {
          const _testId = _relPath.replace(/\//g, '-');
          it(`TF-CF-${_testId}: toFrontmatter の出力が期待値と一致する`, () => {
            const fm = new ChatlogFrontmatter(input);
            if (expected.error) {
              const err = assertThrows(() => fm.toFrontmatter(fieldOrder), ChatlogError);
              assertEquals(err.kind, expected.error);
            } else {
              assertEquals(fm.toFrontmatter(fieldOrder), expected.expected);
            }
          });
        }
      });
    });
  });
});
