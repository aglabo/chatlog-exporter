// src: skills/_cle-libs/classes/__tests__/fixtures/render-entry.fixtures.spec.ts
// @(#): ChatlogEntry.renderEntry() fixtures テスト
//       fixtures-data/render-entry/ 下の各ディレクトリをスキャンし
//       input.md を処理し、expected.md の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// libs
import { parse as parseYaml } from '@std/yaml';

// -- test target --
import { ChatlogEntry } from '../../ChatlogEntry.class.ts';

// -- helpers --
import { findFixtureDirs } from '../../../__tests__/helpers/find-fixture-dirs.ts';
import { normalizePath } from '../../../libs/path-utils/path-utils.ts';
// type
import type { IsFixtureDirProvider } from '../../../__tests__/helpers/find-fixture-dirs.ts';
// file libs
import { readTextFile } from '../../../libs/file-io/read-utils.ts';
import { fileExists } from '../../../libs/file-ops/exists-utils.ts';
// -- error class --
import { ChatlogError } from '../../ChatlogError.class.ts';

// ─────────────────────────────────────────────
// renderEntry — ファイルベース fixtures
// ─────────────────────────────────────────────

interface _FixtureConfig {
  fieldOrder: string[];
}

type _FixtureExpected =
  | { expected: string; error?: never }
  | { error: string; expected?: never };

const FIXTURES_DIR = normalizePath(new URL('./fixtures-data/render-entry', import.meta.url).pathname);

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

const _isFixtureDir: IsFixtureDirProvider = async (dir) => {
  return await fileExists(`${dir}/input.md`) && await fileExists(`${dir}/config.yaml`);
};

const _fixtureDirs = await findFixtureDirs(FIXTURES_DIR, _isFixtureDir);
const _fixtures = await Promise.all(
  _fixtureDirs.map(async (relPath) => ({ relPath, ...await _loadFixture(`${FIXTURES_DIR}/${relPath}`) })),
);

describe('renderEntry', () => {
  describe('Given: fixtures-data/render-entry/ 下の各 fixture ディレクトリ', () => {
    describe('When: renderEntry(fieldOrder) を呼び出す', () => {
      describe('Then: expected.md と一致する', () => {
        for (const { relPath: _relPath, input, fieldOrder, expected } of _fixtures) {
          const _testId = _relPath.replace(/\//g, '-');
          it(`RE-CE-${_testId}: renderEntry の出力が期待値と一致する`, () => {
            const entry = new ChatlogEntry(input);
            if (expected.error) {
              const err = assertThrows(() => entry.renderEntry(fieldOrder), ChatlogError);
              assertEquals(err.kind, expected.error);
            } else {
              const result = entry.renderEntry(fieldOrder);
              assertEquals(result, expected.expected);
            }
          });
        }
      });
    });
  });
});
