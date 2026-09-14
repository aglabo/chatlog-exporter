// src: skills/_cle-libs/libs/ai/__tests__/helpers/output-contract-check.ts
// @(#): runAI 呼び出しの出力契約指定の静的検査ヘルパー（テスト専用）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// libs
import { expandGlob } from '@std/fs';
import { getRelativePath, joinPath, normalizePath } from '../../../path-utils/path-utils.ts';

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

/** `checkRunAIContract` の結果。`runAI` を import しないソースは判定対象外となる。 */
export type RunAIContractCheckResult =
  | { readonly importsRunAI: false }
  | { readonly importsRunAI: true; readonly conforming: boolean };

/** `enumerateRunAIFiles` が列挙する、`runAI` を import するファイルとその判定結果。 */
export type RunAIFileEntry = {
  readonly filePath: string;
  readonly result: RunAIContractCheckResult;
};

// ─────────────────────────────────────────────
// 内部定数
// ─────────────────────────────────────────────

/** `run-ai.ts` で終わるモジュールパスから `runAI` を名前付き import する文。`g` フラグは付けない（`lastIndex` を持たせない）。 */
const _RUN_AI_IMPORT_PATTERN = /import\s*(?:type\s*)?\{[^}]*\brunAI\b[^}]*\}\s*from\s*['"][^'"]*\/run-ai\.ts['"]/;

/** 呼び出しオプションでの出力契約指定（`outputContract:`）。`g` フラグは付けない。 */
const _OUTPUT_CONTRACT_PATTERN = /\boutputContract\s*:/;

/** テスト配下を示すパスセグメント（`normalizePath` 後の `/` 区切りで照合する）。 */
const _TESTS_DIR_SEGMENT = '/__tests__/';

/** spec ファイルのファイル名終端（`__tests__/` 外に置かれた spec も除外する）。 */
const _SPEC_FILE_SUFFIX = '.spec.ts';

/** 共有ライブラリの配布ミラー（リポジトリ相対・絶対パスのどちらでも部分一致で照合する）。 */
const _DISTRIBUTION_MIRROR_DIR = 'skills/setup-chatlogs/assets/';

/** 列挙対象の glob（リポジトリルート相対。`**` はディレクトリを跨ぐ）。 */
const _SKILLS_TS_GLOB = 'skills/**/*.ts';

// ─────────────────────────────────────────────
// 純関数
// ─────────────────────────────────────────────

/**
 * ソース文字列が `runAI` を import しているか、している場合に出力契約を指定しているかを判定する。
 *
 * @param source - 検査対象の TypeScript ソース文字列
 * @returns `runAI` を import しない場合は `{ importsRunAI: false }`、する場合は `outputContract:` の有無による適合判定
 */
export const checkRunAIContract = (source: string): RunAIContractCheckResult =>
  _RUN_AI_IMPORT_PATTERN.test(source)
    ? { importsRunAI: true, conforming: _OUTPUT_CONTRACT_PATTERN.test(source) }
    : { importsRunAI: false };

/**
 * 静的検査の列挙対象から除外するパスかを判定する。
 *
 * 除外規則は列挙漏れではなく誤検出を防ぐためのもので、3 つとも省略できない。
 * - `/__tests__/` を含む — テストコードとその fixture
 * - `.spec.ts` で終わる — `__tests__/` 外に置かれたテストファイル
 * - `skills/setup-chatlogs/assets/` を含む — `skills/_cle-libs/**` から自動生成される配布ミラー。
 *   除外しないと同一の `runAI` 利用を二重に数える
 *
 * @param path - 判定対象のパス（区切り文字は問わない）
 * @returns 除外する場合 `true`
 */
export const isExcludedPath = (path: string): boolean => {
  const _normalized = normalizePath(path);
  return (
    _normalized.includes(_TESTS_DIR_SEGMENT)
    || _normalized.endsWith(_SPEC_FILE_SUFFIX)
    || _normalized.includes(_DISTRIBUTION_MIRROR_DIR)
  );
};

// ─────────────────────────────────────────────
// 薄い I/O
// ─────────────────────────────────────────────

/**
 * `skills/**\/*.ts` から除外パスを除き、`runAI` を import するファイルを列挙する。
 *
 * @param repoRoot - リポジトリルートの絶対パス
 * @returns リポジトリ相対パス（`/` 区切り）と判定結果の組
 */
export const enumerateRunAIFiles = async (repoRoot: string): Promise<readonly RunAIFileEntry[]> => {
  const _walked = await Array.fromAsync(expandGlob(_SKILLS_TS_GLOB, { root: repoRoot, includeDirs: false }));
  const _checked = await Promise.all(
    _walked
      .map((entry) => getRelativePath(repoRoot, entry.path))
      .filter((filePath) => !isExcludedPath(filePath))
      .map(async (filePath) => ({
        filePath,
        result: checkRunAIContract(await Deno.readTextFile(joinPath(repoRoot, filePath))),
      })),
  );
  return _checked.filter(({ result }) => result.importsRunAI);
};
