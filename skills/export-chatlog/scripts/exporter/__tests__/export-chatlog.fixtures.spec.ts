// src: skills/export-chatlog/scripts/exporter/__tests__/fixtures/export-chatlog.fixtures.spec.ts
// @(#): export-chatlog fixtures テスト（実 JSONL パーサー使用）
//       fixtures-data/ 下の各ディレクトリを findFixtureDirs でスキャンし
//       input.jsonl を parseClaudeSession / parseCodexSession でパースして
//       output.yaml の期待値と照合する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { parse as parseYaml } from '@std/yaml';

// -- helpers --
import {
  findFixtureDirs,
  type IsFixtureDirProvider,
} from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';

// -- test target --
import { parsePeriod } from '../../../libs/period-filter.ts';
import { parseClaudeSession } from '../../claude-exporter.ts';
import { parseCodexSession } from '../../codex-exporter.ts';

// -- types --
import type { PeriodRange } from '../../../types/filter.types.ts';

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const ALL_PERIOD: PeriodRange = parsePeriod(undefined);

const FIXTURES_DIR = new URL('../fixtures-data', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────

const _isFixtureDir: IsFixtureDirProvider = async (dir) => {
  try {
    await Deno.stat(`${dir}/input.jsonl`);
    return true;
  } catch {
    return false;
  }
};

/** output.yaml が存在する場合に読み込む（edge 系は null） */
async function _loadOutputOrNull(dir: string): Promise<FixtureOutput | null> {
  try {
    const content = await Deno.readTextFile(`${dir}/output.yaml`);
    return parseYaml(content) as FixtureOutput;
  } catch {
    return null;
  }
}

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

// ─────────────────────────────────────────────
// fixture データ ロード
// ─────────────────────────────────────────────

const _claudeFixtures = await _loadFixtures(`${FIXTURES_DIR}/claude-sessions`);
const _codexFixtures = await _loadFixtures(`${FIXTURES_DIR}/codex-sessions`);

// ─────────────────────────────────────────────
// Claude セッション fixture テスト
// ─────────────────────────────────────────────

/**
 * Claude セッション fixtures の自動テスト群。
 *
 * `fixtures-data/claude-sessions/` 配下のサブディレクトリを走査し、
 * `input.jsonl` を `parseClaudeSession` でパースして `output.yaml` の
 * 期待値（sessionId・date・project・turnCount・firstUserText）と照合する。
 *
 * ディレクトリ名に "edge" を含む場合は `null` が返ることを検証する（エッジケース）。
 * 新しい fixture ディレクトリを追加するだけでテストが自動追加される構造になっている。
 *
 * @see parseClaudeSession
 */
describe('parseClaudeSession', () => {
  describe('Given: fixtures-data/claude-sessions/ 下の各 fixture ディレクトリ', () => {
    describe('When: parseClaudeSession(inputPath, allPeriod) を呼び出す', () => {
      describe('Then: セッション情報が期待値と一致する', () => {
        for (const { relPath, inputPath, expected, isEdge } of _claudeFixtures) {
          const _testId = relPath.replace(/\//g, '-');
          it(`SF-EC-claude-${_testId}: セッション情報が期待値と一致する`, async () => {
            const result = await parseClaudeSession(inputPath, ALL_PERIOD);
            if (isEdge) {
              assertEquals(result, null);
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

// ─────────────────────────────────────────────
// Codex セッション fixture テスト
// ─────────────────────────────────────────────

/**
 * Codex セッション fixtures の自動テスト群。
 *
 * `fixtures-data/codex-sessions/` 配下のサブディレクトリを走査し、
 * `input.jsonl` を `parseCodexSession` でパースして `output.yaml` の
 * 期待値（sessionId・date・project・turnCount・firstUserText）と照合する。
 *
 * ディレクトリ名に "edge" を含む場合は `null` が返ることを検証する（エッジケース）。
 * 新しい fixture ディレクトリを追加するだけでテストが自動追加される構造になっている。
 *
 * @see parseCodexSession
 */
describe('parseCodexSession', () => {
  describe('Given: fixtures-data/codex-sessions/ 下の各 fixture ディレクトリ', () => {
    describe('When: parseCodexSession(inputPath, allPeriod) を呼び出す', () => {
      describe('Then: セッション情報が期待値と一致する', () => {
        for (const { relPath, inputPath, expected, isEdge } of _codexFixtures) {
          const _testId = relPath.replace(/\//g, '-');
          it(`SF-EC-codex-${_testId}: セッション情報が期待値と一致する`, async () => {
            const result = await parseCodexSession(inputPath, ALL_PERIOD);
            if (isEdge) {
              assertEquals(result, null);
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
