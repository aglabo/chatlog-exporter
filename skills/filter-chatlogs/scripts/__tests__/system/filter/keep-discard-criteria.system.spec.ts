// src: scripts/__tests__/system/filter/keep-discard-criteria.system.spec.ts
// @(#): KEEP/DISCARD 判定基準の実 AI 検証（判断理由の有無で判定されること）
//       対象: _SYSTEM_PROMPT
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
// external modules
import { parse as parseYaml } from '@std/yaml';

// ─── Test target
import { _SYSTEM_PROMPT } from '../../../modules/filter/process-chunk.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
// functions
import { findFixtureDirs } from '../../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
import { runAI } from '../../../../../_cle-libs/libs/ai/run-ai.ts';
import { readTextFile } from '../../../../../_cle-libs/libs/file-io/read-utils.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
import { parseAiJsonArray } from '../../../../../_cle-libs/libs/text/json-utils.ts';
import { buildBatchPrompt } from '../../../libs/batch-prompt.ts';
// types
import type { FilterDecision } from '../../../types/filter-decision.const.types.ts';
import type { ClaudeResult } from '../../../types/filter.types.ts';

// ─── Internal Helpers

// constants
/** 判定基準テスト用 fixture ルートディレクトリの絶対パス。 */
const FIXTURES_DIR = normalizePath(new URL('./fixtures', import.meta.url).pathname);

/** `RUN_AI=1` が設定されている場合に `true`。実 AI 呼び出しを伴うテストの実行制御に使用する。 */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

/** fixture 名 → テスト ID の対応表。ID を収集順から導出せず固定し、fixture 追加時の ID ずれを防ぐ。 */
const _TEST_IDS: Record<string, string> = {
  'normal-01-rationale-keep': 'T-FL-KDC-01',
  'normal-02-technical-execution-discard': 'T-FL-KDC-02',
};

// types
/** `output.yaml` に記述する期待値。 */
interface FixtureOutput {
  /** 期待する判定識別子（`KEEP` / `DISCARD`）。 */
  expected_decision: FilterDecision;
  /** 判定に要求する最低信頼度。 */
  confidence_min: number;
}

/** fixture ディレクトリ 1 件分の情報を束ねる型。 */
interface FixtureInfo {
  /** `FIXTURES_DIR` からの相対パス（fixture 名）。 */
  relPath: string;
  /** `input.md` の絶対パス。 */
  inputPath: string;
  /** `output.yaml` から読み込んだ期待値。 */
  expectedOutput: FixtureOutput;
}

// functions
/**
 * fixture ディレクトリの `output.yaml` から期待値を読み込む。
 *
 * @param dir - fixture ディレクトリの絶対パス
 * @returns パース済みの `FixtureOutput`
 */
const _loadOutput = async (dir: string): Promise<FixtureOutput> => {
  const _content = await readTextFile(`${dir}/output.yaml`);
  return parseYaml(_content) as FixtureOutput;
};

/**
 * `rootDir` 以下の fixture 情報を収集する。
 *
 * `findFixtureDirs` で相対パス一覧を取得し、各ディレクトリの `input.md` パスと
 * `output.yaml` の期待値を付加した `FixtureInfo[]` を返す。
 *
 * @param rootDir - fixtures ルートディレクトリの絶対パス
 * @returns 辞書順の `FixtureInfo` 配列
 */
const _loadFixtureInfos = async (rootDir: string): Promise<FixtureInfo[]> => {
  const _relPaths = await findFixtureDirs(rootDir);
  return Promise.all(
    _relPaths.map(async (relPath) => ({
      relPath,
      inputPath: `${rootDir}/${relPath}/input.md`,
      expectedOutput: await _loadOutput(`${rootDir}/${relPath}`),
    })),
  );
};

/**
 * 1 件の fixture を実運用と同じ経路（`buildBatchPrompt` → `runAI` → `parseAiJsonArray`）で判定する。
 *
 * システムプロンプトは本体の `_SYSTEM_PROMPT` をそのまま使い、テスト側で再定義しない。
 *
 * @param inputPath - 判定対象 `input.md` の絶対パス
 * @returns 判定結果 1 件分の `ClaudeResult`
 */
const _judgeFixture = async (inputPath: string): Promise<ClaudeResult> => {
  const _entry = new ChatlogEntry(await readTextFile(inputPath), { filePath: inputPath });
  const _prompt = buildBatchPrompt([_entry]);
  const _raw = await runAI(_SYSTEM_PROMPT, _prompt);
  const _parsed = parseAiJsonArray<ClaudeResult>(_raw);
  assert(
    _parsed !== null && _parsed.length > 0,
    `AI 応答から判定 JSON を取得できなかった: ${_raw}`,
  );
  return _parsed[0];
};

// ─── Tests

const _fixtures = await _loadFixtureInfos(FIXTURES_DIR);

/**
 * `_SYSTEM_PROMPT` の KEEP/DISCARD 判定基準の実 AI システムテストスイート（`RUN_AI=1` のみ実行）。
 *
 * 判定軸が「技術的か」ではなく「判断の理由（WHY）が残っているか」であることを、
 * 技術用語の濃さと理由の有無を逆転させた 2 件の fixture で検証する。
 *
 * テスト ID 範囲: T-FL-KDC-01 〜 T-FL-KDC-02
 *
 * @see _SYSTEM_PROMPT
 */
describe('[AI] _SYSTEM_PROMPT - KEEP/DISCARD 判定基準', { ignore: !_shouldRunAI }, () => {
  /** fixture ごとに期待判定と信頼度下限を検証する正常系ケース。 */
  describe('When: 正常系', () => {
    _fixtures.forEach((fixture) => {
      const _testId = _TEST_IDS[fixture.relPath];
      if (_testId === undefined) {
        throw new Error(`fixture "${fixture.relPath}" に対応するテスト ID が _TEST_IDS に未登録`);
      }
      it(
        `[AI] ${_testId}: ${fixture.relPath} は ${fixture.expectedOutput.expected_decision} と判定される`,
        async () => {
          const _result = await _judgeFixture(fixture.inputPath);

          assertEquals(
            _result.decision,
            fixture.expectedOutput.expected_decision,
            `decision "${_result.decision}" が期待値 "${fixture.expectedOutput.expected_decision}" と不一致`
              + ` (reason: ${_result.reason})`,
          );
          assertEquals(
            _result.confidence >= fixture.expectedOutput.confidence_min,
            true,
            `confidence ${_result.confidence} が confidence_min ${fixture.expectedOutput.confidence_min} 未満`,
          );
        },
      );
    });
  });
});
