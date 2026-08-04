// src: skills/_cle-libs/classes/__tests__/fixtures/divide-content.fixtures.spec.ts
// @(#): ChatlogEntry.frontmatterText / content fixtures テスト
//       fixtures-data/divide-content/ 下の各ディレクトリをスキャンし
//       input.md を処理し、expected.yaml の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// -- error class --
import { ChatlogError } from '../../ChatlogError.class.ts';

// -- helpers --
import { findFixtureDirs, type IsFixtureDirProvider } from '../../../__tests__/helpers/find-fixture-dirs.ts';
import { normalizePath } from '../../../libs/path-utils/path-utils.ts';
// exists
import { readTextFile } from '../../../libs/file-io/read-utils.ts';
import { fileExists } from '../../../libs/file-ops/exists-utils.ts';

// -- test target --
import { ChatlogEntry } from '../../ChatlogEntry.class.ts';

// ─────────────────────────────────────────────
// divideContent — ファイルベース fixtures
// ─────────────────────────────────────────────

type _FixtureExpected =
  | { frontmatterText: string; content: string; error?: never }
  | { error: string; frontmatterText?: never; content?: never };

const FIXTURES_DIR = normalizePath(new URL('./fixtures-data/divide-entry', import.meta.url).pathname);

const _isFixtureDir: IsFixtureDirProvider = async (dir) => {
  return await fileExists(`${dir}/input.md`);
};

async function _loadFixture(
  dir: string,
): Promise<{ input: string; expected: _FixtureExpected }> {
  const input = await readTextFile(`${dir}/input.md`);
  const expectedRaw = await readTextFile(`${dir}/expected.yaml`);
  const expected = parseYaml(expectedRaw) as _FixtureExpected;
  return { input, expected };
}

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => ({ relPath, ...await _loadFixture(`${FIXTURES_DIR}/${relPath}`) })),
);

describe('divideContent', () => {
  describe('Given: fixtures-data/divide-content/ 下の各 fixture ディレクトリ', () => {
    describe('When: new ChatlogEntry(input) でインスタンスを生成する', () => {
      describe('Then: frontmatterText と content が期待値と一致する', () => {
        for (const { relPath: _relPath, input, expected } of _fixtures) {
          const _testId = _relPath.replace(/\//g, '-');
          it(`DC-CE-${_testId}: frontmatterText と content が期待値と一致する`, () => {
            if (expected.error) {
              const err = assertThrows(
                () => new ChatlogEntry(input),
                ChatlogError,
              );
              assertEquals(err.kind, expected.error);
            } else {
              const entry = new ChatlogEntry(input);
              assertEquals(entry.frontmatterText, expected.frontmatterText);
              assertEquals(entry.content, expected.content);
            }
          });
        }
      });
    });
  });
});
