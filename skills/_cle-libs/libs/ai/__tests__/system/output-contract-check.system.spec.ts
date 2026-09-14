// src: skills/_cle-libs/libs/ai/__tests__/system/output-contract-check.system.spec.ts
// @(#): runAI 呼び出しの出力契約指定の静的検査（実ファイル）のシステムテスト
//       対象: enumerateRunAIFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { enumerateRunAIFiles } from '../helpers/output-contract-check.ts';

// ─── Helpers
import { normalizePath } from '../../../path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
/** リポジトリルートの絶対パス（Windows の `/C:/...` 形式も正規化する）。 */
const _REPO_ROOT = normalizePath(new URL('../../../../../../', import.meta.url).pathname);

/** `runAI` を import する production ファイル（リポジトリ相対・ソート済み）。追加時はここを更新し、契約指定も必須とする。 */
const _RUN_AI_CALLERS: readonly string[] = [
  'skills/classify-chatlogs/scripts/phases/phase-classify-ai.ts',
  'skills/filter-chatlogs/scripts/modules/filter/process-chunk.ts',
  'skills/normalize-chatlogs/scripts/modules/segment-ai.ts',
  'skills/set-frontmatter/scripts/modules/setfm-frontmatter.ts',
  'skills/set-frontmatter/scripts/modules/setfm-review.ts',
  'skills/set-frontmatter/scripts/modules/setfm-type-category.ts',
];

// ─── Tests

/**
 * `runAI` 呼び出しの出力契約指定の静的検査ヘルパーのシステムテストスイート。
 *
 * リポジトリの実ファイル（`skills/**\/*.ts`、除外規則適用後）から `runAI` を import するファイルを列挙し、
 * 呼び出し箇所の追加漏れと `outputContract:` の指定漏れを検出する回帰ガード。
 *
 * テスト ID 範囲: T-LIB-AI-LWR-04-01
 *
 * @see enumerateRunAIFiles
 */
describe('output-contract-check', () => {
  /** 実ファイルの `runAI` 呼び出し箇所が期待どおりで、全件が出力契約を指定しているケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-AI-LWR-04-01: runAI を import する production ファイルはちょうど 6 本で全件 outputContract: を指定', async () => {
      const _entries = await enumerateRunAIFiles(_REPO_ROOT);

      assertEquals(
        _entries.map(({ filePath }) => filePath).toSorted(),
        [..._RUN_AI_CALLERS],
        'runAI を import するファイル',
      );
      assertEquals(
        _entries.filter(({ result }) => !(result.importsRunAI && result.conforming)).map(({ filePath }) => filePath),
        [],
        'outputContract: を指定していないファイル',
      );
    });
  });
});
