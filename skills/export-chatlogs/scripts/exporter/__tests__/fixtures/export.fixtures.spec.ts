// src: skills/export-chatlogs/scripts/exporter/__tests__/fixtures/export.fixtures.spec.ts
// @(#): export-chatlogs fixtures テスト（実 JSONL パーサー使用）
//       fixtures-data/ 下の各ディレクトリを findFixtureDirs でスキャンし
//       input.jsonl を parseClaudeSession / parseCodexSession でパースして
//       output.yaml の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';
import { assertNull } from '../../../../../_scripts/__tests__/helpers/assert.ts';

// ─── Test target
import { parsePeriod } from '../../../libs/period-filter.ts';
import { parseClaudeSession } from '../../claude-exporter.ts';
import { parseCodexSession } from '../../codex-exporter.ts';

// ─── Helpers
import { findFixtureDirs } from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { normalizePath } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { IsFixtureDirProvider } from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import type { PeriodRange } from '../../../types/filter.types.ts';
// exists
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';
import { fileExists } from '../../../../../_scripts/libs/file-ops/exists-utils.ts';

// ─── Internal Helpers

// types
interface FixtureOutput {
  sessionId: string;
  date: string;
  project: string;
  turnCount: number;
  firstUserText: string;
}

interface FixtureData {
  relPath: string;
  inputPath: string;
  expected: FixtureOutput | null;
  isEdge: boolean;
}

// constants
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

const FIXTURES_DIR = normalizePath(new URL('../fixtures-data', import.meta.url).pathname);

// functions
/**  fixture ディレクトリチェック */
const _isFixtureDir: IsFixtureDirProvider = async (dir) => {
  return await fileExists(`${dir}/input.jsonl`);
};

/** output.yaml が存在する場合に読み込む（edge 系は null） */
async function _loadOutputOrNull(dir: string): Promise<FixtureOutput | null> {
  try {
    const content = await readTextFile(`${dir}/output.yaml`);
    return parseYaml(content) as FixtureOutput;
  } catch {
    return null;
  }
}

/** Fixture Data を読み込む */
async function _loadFixtures(agentDir: string): Promise<FixtureData[]> {
  const _relPaths = await findFixtureDirs(agentDir, _isFixtureDir);
  return Promise.all(
    _relPaths.map(async (relPath) => {
      const _fixtureDir = `${agentDir}/${relPath}`;
      return {
        relPath,
        inputPath: `${_fixtureDir}/input.jsonl`,
        expected: await _loadOutputOrNull(_fixtureDir),
        isEdge: relPath.includes('edge'),
      };
    }),
  );
}

// ─── Fixtures
/** Claude セッション fixtures */
const _claudeFixtures = await _loadFixtures(`${FIXTURES_DIR}/claude-sessions`);

/** codex セッション fixtures */
const _codexFixtures = await _loadFixtures(`${FIXTURES_DIR}/codex-sessions`);

// ─── Tests

// ─── Claude セッション fixture テスト ─────────────────────────────────────────

/**
 * Claude セッション fixtures の自動テスト群。
 *
 * `fixtures-data/claude-sessions/` 配下のサブディレクトリを走査し、
 * `input.jsonl` を `parseClaudeSession` でパースして `output.yaml` の
 * 期待値（sessionId・date・project・turnCount・firstUserText）と照合する。
 * ディレクトリ名に "edge" を含む場合は `null` が返ることを検証する（エッジケース）。
 * `findFixtureDirs` でスキャンした結果をもとにテストを動的生成するため、
 * 新しい fixture ディレクトリを追加するだけでテストが自動追加される。
 *
 * @see parseClaudeSession
 */
describe('parseClaudeSession', () => {
  /**
   * fixtures-data/claude-sessions/ 配下の全サブディレクトリが前提条件。
   * 各サブディレクトリには input.jsonl（パース対象）と output.yaml（期待値）が含まれる。
   * "edge" を含むディレクトリは出力なし（null 期待）として扱う。
   */
  describe('Given: fixtures-data/claude-sessions/ 下の各 fixture ディレクトリ', () => {
    /** 各 fixture の `input.jsonl` をパースして結果を取得する。 */
    describe('When: parseClaudeSession(inputPath, allPeriod) を呼び出す', () => {
      /** `output.yaml` の期待値（または edge → null）と照合する。 */
      describe('Then: セッション情報が期待値と一致する', () => {
        for (const { relPath, inputPath, expected, isEdge } of _claudeFixtures) {
          const _testId = relPath.replace(/\//g, '-');
          it(`SF-EC-claude-${_testId}: セッション情報が期待値と一致する`, async () => {
            const result = await parseClaudeSession(inputPath, ALL_PERIOD);
            if (isEdge) {
              assertNull(result);
            } else {
              assertEquals(result?.meta.sessionId, expected!.sessionId);
              assertEquals(result?.meta.date, expected!.date);
              assertEquals(result?.meta.project, expected!.project);
              assertEquals(result?.meta.firstUserText, expected!.firstUserText);
              assertEquals(result?.turns.length, expected!.turnCount);
            }
          });
        }
      });
    });
  });
});

// ─── Codex セッション fixture テスト ──────────────────────────────────────────

/**
 * Codex セッション fixtures の自動テスト群。
 *
 * `fixtures-data/codex-sessions/` 配下のサブディレクトリを走査し、
 * `input.jsonl` を `parseCodexSession` でパースして `output.yaml` の
 * 期待値（sessionId・date・project・turnCount・firstUserText）と照合する。
 * ディレクトリ名に "edge" を含む場合は `null` が返ることを検証する（エッジケース）。
 * `findFixtureDirs` でスキャンした結果をもとにテストを動的生成するため、
 * 新しい fixture ディレクトリを追加するだけでテストが自動追加される。
 *
 * @see parseCodexSession
 */
describe('parseCodexSession', () => {
  /**
   * fixtures-data/codex-sessions/ 配下の全サブディレクトリが前提条件。
   * 各サブディレクトリには input.jsonl（パース対象）と output.yaml（期待値）が含まれる。
   * "edge" を含むディレクトリは出力なし（null 期待）として扱う。
   */
  describe('Given: fixtures-data/codex-sessions/ 下の各 fixture ディレクトリ', () => {
    /** 各 fixture の `input.jsonl` をパースして結果を取得する。 */
    describe('When: parseCodexSession(inputPath, allPeriod) を呼び出す', () => {
      /** `output.yaml` の期待値（または edge → null）と照合する。 */
      describe('Then: セッション情報が期待値と一致する', () => {
        for (const { relPath, inputPath, expected, isEdge } of _codexFixtures) {
          const _testId = relPath.replace(/\//g, '-');
          it(`SF-EC-codex-${_testId}: セッション情報が期待値と一致する`, async () => {
            const result = await parseCodexSession(inputPath, ALL_PERIOD);
            if (isEdge) {
              assertNull(result);
            } else {
              assertEquals(result?.meta.sessionId, expected!.sessionId);
              assertEquals(result?.meta.date, expected!.date);
              assertEquals(result?.meta.project, expected!.project);
              assertEquals(result?.meta.firstUserText, expected!.firstUserText);
              assertEquals(result?.turns.length, expected!.turnCount);
            }
          });
        }
      });
    });
  });
});
