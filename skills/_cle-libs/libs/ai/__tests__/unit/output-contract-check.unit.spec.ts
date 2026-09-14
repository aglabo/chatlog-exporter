// src: skills/_cle-libs/libs/ai/__tests__/unit/output-contract-check.unit.spec.ts
// @(#): runAI 呼び出しの出力契約指定の静的検査ヘルパーのユニットテスト
//       対象: checkRunAIContract, isExcludedPath
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { checkRunAIContract, isExcludedPath } from '../helpers/output-contract-check.ts';

// ─── Internal Helpers

// types
/** 除外パス判定テーブルの 1 行。 */
type _ExcludedPathCase = { readonly id: string; readonly label: string; readonly path: string };

// constants
/** 静的検査の列挙対象から除外されるべきパス fixture（除外規則 1 つにつき 1 行）。 */
const _excludedPathCases: readonly _ExcludedPathCase[] = [
  {
    id: 'T-LIB-AI-LWR-04-03',
    label: '__tests__ 配下の非 spec ファイル',
    path: 'skills/filter-chatlogs/scripts/modules/filter/__tests__/helpers/runner-stub.ts',
  },
  {
    id: 'T-LIB-AI-LWR-04-04',
    label: '__tests__ 外の *.spec.ts',
    path: 'skills/filter-chatlogs/scripts/modules/filter/process-chunk.spec.ts',
  },
  {
    id: 'T-LIB-AI-LWR-04-05',
    label: '配布ミラー skills/setup-chatlogs/assets/ 配下',
    path: 'skills/setup-chatlogs/assets/_cle-libs/libs/ai/run-ai.ts',
  },
];

/** `runAI` を import し、呼び出しオプションに `outputContract:` を持たないソース fixture。 */
const _SOURCE_WITHOUT_CONTRACT =
  "import { runAI } from '../../../_cle-libs/libs/ai/run-ai.ts';\nexport const run = (p = runAI) => p('s', 'u', { model: 'sonnet' });\n";

// ─── Tests

/**
 * `runAI` 呼び出しの出力契約指定の静的検査ヘルパーのユニットテストスイート。
 *
 * fixture 文字列を純関数に渡し、`runAI` の import 判定と `outputContract:` 指定の適合判定、
 * および列挙対象からの除外パス判定を検証する。
 *
 * テスト ID 範囲: T-LIB-AI-LWR-04-02 〜 T-LIB-AI-LWR-04-05
 *
 * @see checkRunAIContract
 * @see isExcludedPath
 */
describe('output-contract-check', () => {
  /**
   * `checkRunAIContract` の適合判定テスト。
   *
   * `runAI` を import するソースについて、`outputContract:` の有無で適合性を判定することを検証する。
   */
  describe('checkRunAIContract', () => {
    it('[Normal] T-LIB-AI-LWR-04-02: runAI を import し outputContract: を持たないソース → 不適合', () => {
      assertEquals(checkRunAIContract(_SOURCE_WITHOUT_CONTRACT), { importsRunAI: true, conforming: false });
    });
  });

  /**
   * `isExcludedPath` の除外判定テスト。
   *
   * テスト配下のファイル、spec ファイルおよび配布ミラー配下のファイルが静的検査の列挙対象から除外されることを検証する。
   */
  describe('isExcludedPath', () => {
    for (const { id, label, path } of _excludedPathCases) {
      it(`[Edge] ${id}: ${label} → 除外 (${path})`, () => {
        assertEquals(isExcludedPath(path), true);
      });
    }
  });
});
