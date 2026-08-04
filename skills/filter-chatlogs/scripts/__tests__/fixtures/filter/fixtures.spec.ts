// src: scripts/__tests__/fixtures/filter/fixtures.spec.ts
// @(#): filter-chatlogs fixturesテスト（実 AI 呼び出し使用）
//       対象: runAI, parseAiJsonArray
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
import { runAI } from '../../../../../_cle-libs/libs/ai/run-ai.ts';
import { parseAiJsonArray } from '../../../../../_cle-libs/libs/text/json-utils.ts';

// ─── Helpers
import { findFixtureDirs } from '../../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
import { readTextFile } from '../../../../../_cle-libs/libs/file-io/read-utils.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// types
import type { FilterDecision } from '../../../types/filter-decision.const.types.ts';

// ─── Internal Helpers

// constants
/** Real AI テスト用システムプロンプト（process-chunk.ts の _SYSTEM_PROMPT と同値）。 */
const _SYSTEM_PROMPT = `Output ONLY a JSON array. No markdown, no explanation, no text before or after the array.
[{"file":"<filename>","decision":"KEEP or DISCARD","confidence":0.0,"reason":"..."},...]

KEEP: design decisions, reusable patterns, new concepts, architecture discussion
DISCARD: execution-only, trivial Q&A, no reusable insight, context-dependent`;

/** fixtures-data/fixtures/real の絶対パス。 */
const REAL_FIXTURES_DIR = normalizePath(new URL('./fixtures-data/fixtures/real', import.meta.url).pathname);

/** `RUN_AI=1`: test with exec run AI */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

// types
interface FixtureOutput {
  expected_decision: FilterDecision;
  confidence_min: number;
  mock_response?: string;
}

interface ClaudeResult {
  decision: FilterDecision;
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
 * 1件の fixture を実際の claude CLI で検証する（RUN_AI=1 のみ）。
 *
 * @param fixture - mock_response を持たない FixtureInfo
 */
const _runRealFixture = async (fixture: FixtureInfo): Promise<void> => {
  const _inputContent = await readTextFile(fixture.inputPath);
  const { body } = _parseFrontmatter(_inputContent);
  const _prompt = _buildUserPrompt('input.md', body.slice(0, 8000));

  const _rawResult = await runAI(_SYSTEM_PROMPT, _prompt);
  const _parsed = parseAiJsonArray<ClaudeResult>(_rawResult);
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

const _realFixtures = await _loadFixtureInfos(REAL_FIXTURES_DIR);

// NOTE: 「Mock判定」ブロック（mock_response を parseAiJsonArray に通し同じ fixture の期待値と比較するだけの自己参照テスト）は削除済み。
// runAI 等の実装ロジックを経由しないため再追加しないこと。

/**
 * 実 claude CLI を使った fixture ドリブンテストスイート（`RUN_AI=1` のみ実行）。
 *
 * fixtures-data/fixtures/real/ の各ディレクトリを実 AI で検証する。
 *
 * テスト ID 範囲: T-FL-FC-normal-01-basic-keep / T-FL-FC-normal-02-basic-discard
 *
 * @see runAI
 * @see parseAiJsonArray
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
