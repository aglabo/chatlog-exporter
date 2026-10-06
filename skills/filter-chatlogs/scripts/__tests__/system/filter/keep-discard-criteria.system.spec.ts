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
import { _SYSTEM_PROMPT, buildFilterOutputContract } from '../../../modules/filter/process-chunk.ts';

// ─── Helpers
import { ChatlogEntry } from '../../../../../_cle-libs/classes/ChatlogEntry.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// functions
import { findFixtureDirs } from '../../../../../_cle-libs/__tests__/helpers/find-fixture-dirs.ts';
import { isResponseFormatViolation } from '../../../../../_cle-libs/libs/ai/abort-utils.ts';
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
/**
 * 本テストが `buildBatchPrompt` へ渡す本文上限。既定値と同じ 8000 をリテラルで固定する。
 *
 * production の `DEFAULT_MAX_BODY_CHARS` を**意図的に import しない**。
 * 定数を参照すると既定値を変えたときに本ファイルの期待値も黙って追従し、
 * 既定値の変更がテストに検出されなくなるため。
 */
const _TEST_MAX_BODY_CHARS = 8000;

/** 判定基準テスト用 fixture ルートディレクトリの絶対パス。 */
const FIXTURES_DIR = normalizePath(new URL('./fixtures', import.meta.url).pathname);

/** `RUN_AI=1` が設定されている場合に `true`。実 AI 呼び出しを伴うテストの実行制御に使用する。 */
const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

/** fixture 名 → テスト ID の対応表。ID を収集順から導出せず固定し、fixture 追加時の ID ずれを防ぐ。 */
const _TEST_IDS: Record<string, string> = {
  // 交絡を逆転させた対照ペア（判定軸が「技術的か」ではないことを証明する）
  'normal-01-rationale-keep': 'T-FL-KDC-01',
  'normal-02-technical-execution-discard': 'T-FL-KDC-02',
  // 交絡のない素直なペア（基本動作の回帰検知）
  'normal-03-design-rationale-keep': 'T-FL-KDC-03',
  'normal-04-basic-discard': 'T-FL-KDC-04',
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
 * 判定 1 回分を実行し、応答の形が壊れていれば `undefined` を返す。
 *
 * 「壊れている」は本番 `processChunk` の再要求対象と同じ範囲に限る（filter DR-06 / DR-08）。
 * パース失敗・空配列、および llama 経路が throw する出力契約違反がこれに当たる。
 * それ以外の例外（接続失敗・タイムアウト等）は再要求せずそのまま投げる。
 *
 * @param prompt - `buildBatchPrompt` で組み立てたバッチプロンプト
 * @returns 判定結果と生応答。形が壊れていれば `parsed` は `undefined`
 */
const _judgeOnce = async (prompt: string): Promise<{ parsed: ClaudeResult | undefined; raw: string }> => {
  try {
    const _raw = await runAI(_SYSTEM_PROMPT, prompt, { outputContract: buildFilterOutputContract(1) });
    const _parsed = parseAiJsonArray<ClaudeResult>(_raw, { allowEmpty: true });
    return { parsed: _parsed?.[0], raw: _raw };
  } catch (e) {
    if (!isResponseFormatViolation(e)) { throw e; }
    return { parsed: undefined, raw: (e as Error).message };
  }
};

/**
 * 1 件の fixture を実運用と同じ経路（`buildBatchPrompt` → `runAI` → `parseAiJsonArray`）で判定する。
 *
 * システムプロンプトは本体の `_SYSTEM_PROMPT` をそのまま使い、テスト側で再定義しない。
 *
 * 応答の形が壊れていたときは、本番 `processChunk` と同じく設定 `maxRetry` 回まで再要求する
 * （filter DR-06 / DR-08。上限 10 は `_MAX_RETRY_LIMIT` と同値）。llama / avalon は
 * `{"items": []}` を時々返し（filter DR-05）、本番では再要求で回復するため、1 回の空応答で
 * 判定基準の検証を落とさない。
 *
 * @param inputPath - 判定対象 `input.md` の絶対パス
 * @returns 判定結果 1 件分の `ClaudeResult`
 */
const _judgeFixture = async (inputPath: string): Promise<ClaudeResult> => {
  const _entry = new ChatlogEntry(await readTextFile(inputPath), { filePath: inputPath });
  const _prompt = buildBatchPrompt([_entry], _TEST_MAX_BODY_CHARS);
  const _maxRetry = Math.min(GlobalConfig.getInstance().get('maxRetry') as number, 10);

  const _judgeWithRetry = async (attempt: number): Promise<ClaudeResult> => {
    const { parsed, raw } = await _judgeOnce(_prompt);
    if (parsed !== undefined) { return parsed; }
    assert(attempt < _maxRetry, `AI 応答から判定 JSON を取得できなかった (${attempt + 1} 回試行): ${raw}`);
    return _judgeWithRetry(attempt + 1);
  };
  return _judgeWithRetry(0);
};

// ─── Tests

const _fixtures = await _loadFixtureInfos(FIXTURES_DIR);

/**
 * `_SYSTEM_PROMPT` の KEEP/DISCARD 判定基準の実 AI システムテストスイート（`RUN_AI=1` のみ実行）。
 *
 * fixture は 2 系統を含む。
 *
 * - `normal-01` / `normal-02`: 技術用語の濃さと理由の有無を逆転させた対照ペア。
 *   判定軸が「技術的か」ではなく「判断の理由（WHY）が残っているか」であることを証明する。
 * - `normal-03` / `normal-04`: 交絡のない素直なペア。基本動作の回帰を検知する。
 *
 * 後者は元々 `__tests__/fixtures/filter/fixtures.spec.ts` にあったが、同じ `_SYSTEM_PROMPT` を
 * 同じ経路（`buildBatchPrompt` → `runAI` → `parseAiJsonArray`）で検証する重複スイートだったため、
 * fixture を本スイートへ集約した（cle-er9）。実 AI を呼ぶテストは system tier に一本化する。
 *
 * NOTE: 「Mock 判定」ブロック（`mock_response` を `parseAiJsonArray` に通して同じ fixture の
 * 期待値と比べるだけの自己参照テスト）は削除済み。`runAI` 等の実装ロジックを経由しないため
 * 再追加しないこと。
 *
 * テスト ID 範囲: T-FL-KDC-01 〜 T-FL-KDC-04
 *
 * @see _SYSTEM_PROMPT
 * @see buildBatchPrompt
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
