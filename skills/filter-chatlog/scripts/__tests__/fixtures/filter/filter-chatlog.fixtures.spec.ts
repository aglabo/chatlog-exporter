// src: scripts/__tests__/fixtures/filter/filter-chatlog.fixtures.spec.ts
// @(#): filter-chatlog fixturesテスト（実 AI 呼び出し使用）
//       対象: runAI, parseJsonArray
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// --- external modules
import { parse as parseYaml } from '@std/yaml';

// ─── Test target
import { runAI } from '../../../../../_scripts/libs/ai/run-ai.ts';
import { parseJsonArray } from '../../../../../_scripts/libs/text/json-utils.ts';

// ─── Helpers
import { findFixtureDirs } from '../../../../../_scripts/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_scripts/libs/file-io/read-utils.ts';

// ─── Internal Helpers

// constants
/** Real AI テスト用システムプロンプト（process-chunk.ts の _SYSTEM_PROMPT と同値）。 */
const _SYSTEM_PROMPT = `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","decision":"KEEP or DISCARD","confidence":0.0,"reason":"..."},...]

KEEP: design decisions, reusable patterns, new concepts, architecture discussion
DISCARD: execution-only, trivial Q&A, no reusable insight, context-dependent`;

/** fixtures-data/fixtures/mock の絶対パス（Windows パス正規化済み）。 */
const MOCK_FIXTURES_DIR = new URL('./fixtures-data/fixtures/mock', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

/** fixtures-data/fixtures/real の絶対パス（Windows パス正規化済み）。 */
const REAL_FIXTURES_DIR = new URL('./fixtures-data/fixtures/real', import.meta.url)
  .pathname
  .replace(/^\/([A-Z]:)/, '$1');

/** `RUN_AI=1`: test with exec run AI */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

// types
interface FixtureOutput {
  expected_decision: 'KEEP' | 'DISCARD';
  confidence_min: number;
  mock_response?: string;
}

interface ClaudeResult {
  decision: 'KEEP' | 'DISCARD';
  confidence: number;
}

/** fixture ディレクトリ 1件分の情報を束ねる型。 */
interface FixtureInfo {
  relPath: string;
  inputPath: string;
  expectedOutput: FixtureOutput;
}

// functions
/** output.yaml から期待値を読み込む。 */
const _loadOutput = async (dir: string): Promise<FixtureOutput> => {
  const content = await readTextFile(`${dir}/output.yaml`);
  return parseYaml(content) as FixtureOutput;
};

/**
 * FIXTURES_DIR 以下の fixture 情報を収集する。
 *
 * `findFixtureDirs` で relPath 一覧を取得し、各ディレクトリの
 * inputPath と expectedOutput を付加した FixtureInfo[] を返す。
 *
 * @param rootDir - fixtures ルートディレクトリの絶対パス
 * @returns 辞書順の FixtureInfo 配列
 */
const _loadFixtureInfos = async (rootDir: string): Promise<FixtureInfo[]> => {
  const relPaths = await findFixtureDirs(rootDir);
  return Promise.all(
    relPaths.map(async (relPath) => {
      const fixtureDir = `${rootDir}/${relPath}`;
      return {
        relPath,
        inputPath: `${fixtureDir}/input.md`,
        expectedOutput: await _loadOutput(fixtureDir),
      };
    }),
  );
};

/** YAML frontmatter を除いた本文を返す。 */
const _parseFrontmatter = (text: string): { body: string } => {
  if (!text.startsWith('---\n')) { return { body: text }; }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) { return { body: text }; }
  return { body: text.slice(end + 5) };
};

/**
 * claude CLI に渡すユーザープロンプト文字列を組み立てる。
 *
 * @param filename - 入力ファイル名
 * @param body - Markdown 本文
 * @returns `=== FILE 1: <filename> ===\n<body>` 形式の文字列
 */
const _buildUserPrompt = (filename: string, body: string): string => {
  return `=== FILE 1: ${filename} ===\n${body}`;
};

/**
 * 1件の fixture を mock_response で検証する（常時実行）。
 *
 * @param fixture - mock_response を持つ FixtureInfo
 */
const _runMockFixture = async (fixture: FixtureInfo): Promise<void> => {
  const _inputContent = await readTextFile(fixture.inputPath);
  const { body } = _parseFrontmatter(_inputContent);
  const _prompt = _buildUserPrompt('input.md', body.slice(0, 8000));
  void _prompt;

  const _parsed = parseJsonArray<ClaudeResult>(fixture.expectedOutput.mock_response!);
  if (!_parsed || _parsed.length === 0) { return; }
  const _result = _parsed[0];

  assertEquals(
    _result.confidence >= fixture.expectedOutput.confidence_min,
    true,
    `confidence ${_result.confidence} が confidence_min ${fixture.expectedOutput.confidence_min} 未満`,
  );
  assertEquals(
    _result.decision,
    fixture.expectedOutput.expected_decision,
    `decision "${_result.decision}" が期待値 "${fixture.expectedOutput.expected_decision}" と不一致`,
  );
};

/**
 * 1件の fixture を実際の claude CLI で検証する（RUN_AI=1 のみ）。
 *
 * @param fixture - mock_response を持たない FixtureInfo
 */
const _runRealFixture = async (fixture: FixtureInfo): Promise<void> => {
  const _inputContent = await readTextFile(fixture.inputPath);
  const { body } = _parseFrontmatter(_inputContent);
  const _prompt = _buildUserPrompt('input.md', body.slice(0, 8000));

  const _rawResult = await runAI(_SYSTEM_PROMPT, _prompt);
  const _parsed = parseJsonArray<ClaudeResult>(_rawResult);
  if (!_parsed || _parsed.length === 0) { return; }
  const _result = _parsed[0];

  assertEquals(
    _result.confidence >= fixture.expectedOutput.confidence_min,
    true,
    `confidence ${_result.confidence} が confidence_min ${fixture.expectedOutput.confidence_min} 未満`,
  );
  assertEquals(
    _result.decision,
    fixture.expectedOutput.expected_decision,
    `decision "${_result.decision}" が期待値 "${fixture.expectedOutput.expected_decision}" と不一致`,
  );
};

// ─── Tests

const _mockFixtures = await _loadFixtureInfos(MOCK_FIXTURES_DIR);
const _realFixtures = await _loadFixtureInfos(REAL_FIXTURES_DIR);

/**
 * mock_response を使った fixture ドリブンテストスイート（常時実行）。
 *
 * fixtures-data/fixtures/mock/ の各ディレクトリを mock_response で検証する。
 *
 * テスト ID 範囲: T-FL-FC-edge-01-minimal
 *
 * @see runAI
 * @see parseJsonArray
 */
describe('Mock判定', () => {
  for (const fixture of _mockFixtures) {
    /** `${fixture.relPath}` を mock_response で検証する。 */
    describe(`Given: ${fixture.relPath}`, () => {
      it(
        `T-FL-FC-${fixture.relPath}: 判定が expected_decision (${fixture.expectedOutput.expected_decision}) になる`,
        async () => {
          await _runMockFixture(fixture);
        },
      );
    });
  }
});

/**
 * 実 claude CLI を使った fixture ドリブンテストスイート（`RUN_AI=1` のみ実行）。
 *
 * fixtures-data/fixtures/real/ の各ディレクトリを実 AI で検証する。
 *
 * テスト ID 範囲: T-FL-FC-normal-01-basic-keep / T-FL-FC-normal-02-basic-discard
 *
 * @see runAI
 * @see parseJsonArray
 */
describe('Real AI判定', { ignore: !_shouldRunAI }, () => {
  for (const fixture of _realFixtures) {
    /** `${fixture.relPath}` を実 claude CLI で検証する。 */
    describe(`Given: ${fixture.relPath}`, () => {
      it(
        `T-FL-FC-${fixture.relPath}: 判定が expected_decision (${fixture.expectedOutput.expected_decision}) になる`,
        async () => {
          await _runRealFixture(fixture);
        },
      );
    });
  }
});
