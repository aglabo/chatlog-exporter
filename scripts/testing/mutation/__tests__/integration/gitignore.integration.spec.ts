// src: scripts/testing/mutation/__tests__/integration/gitignore.integration.spec.ts
// @(#): ミューテーションテストの生成物を .gitignore が除外することの統合テスト
//       対象: .gitignore
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Helpers
// constants
import { REPO_ROOT } from '../../constants/mutation.constants.ts';

// ─── Internal Helpers

// functions
/**
 * リポジトリルートで `git check-ignore -q <path>` を実行し、終了コードを返す。
 *
 * パスは実在しなくてよい（git はパターンのみを評価する）。
 *
 * @param path - リポジトリルートからの相対パス
 * @returns 終了コード（`0` = 無視される、`1` = 無視されない）
 */
async function _checkIgnoreCode(path: string): Promise<number> {
  const _output = await new Deno.Command('git', {
    args: ['check-ignore', '-q', path],
    cwd: REPO_ROOT,
    stdout: 'null',
    stderr: 'null',
  }).output();
  return _output.code;
}

// ─── Tests

/**
 * `.gitignore` によるミューテーションテスト生成物の除外テストスイート。
 *
 * 変異体・一時設定・ロックファイルが、許可リストの再許可より後ろの除外行で無視されることを検証する。
 *
 * テスト ID 範囲: T-MUT-SM-17-01 〜 T-MUT-SM-17-04
 *
 * @see REQ-C-005
 */
describe('.gitignore', () => {
  /**
   * 変異体・一時設定・ロックの除外。
   *
   * `git check-ignore -q` の終了コードで、各生成物のパスが無視されることを検証する。
   */
  describe('変異体・一時設定・ロックを除外する', () => {
    /** 許可リストで再許可された配下の生成物が無視される正常ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-MUT-SM-17-01: scripts/ 配下の .ts 変異体 target.mutation-001.ts は無視される (exit 0)', async () => {
        assertEquals(await _checkIgnoreCode('scripts/testing/mutation/target.mutation-001.ts'), 0);
      });

      it('[Normal] T-MUT-SM-17-02: skills/ 配下の .tsx 変異体 view.mutation-001.tsx は無視される (exit 0)', async () => {
        assertEquals(await _checkIgnoreCode('skills/x/scripts/view.mutation-001.tsx'), 0);
      });

      it('[Normal] T-MUT-SM-17-03: 一時設定 deno.mutation-001.json は無視される (exit 0)', async () => {
        assertEquals(await _checkIgnoreCode('deno.mutation-001.json'), 0);
      });

      it('[Normal] T-MUT-SM-17-04: ロックファイル temp/mutation.lock は無視される (exit 0)', async () => {
        assertEquals(await _checkIgnoreCode('temp/mutation.lock'), 0);
      });
    });
  });
});
