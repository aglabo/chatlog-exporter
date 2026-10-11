// src: scripts/testing/mutation/__tests__/integration/mutate-tester-entry.integration.spec.ts
// @(#): mutate-tester を deno run で直接起動したときのエントリポイントの統合テスト
//       対象: mutate-tester.ts (import.meta.main ブロック)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Helpers
import { join } from '@std/path';
// constants
import {
  EXIT_CODE_FAILURE,
  MISSING_MODULE_MESSAGE,
  REPO_ROOT,
} from '../../constants/mutation.constants.ts';

// ─── Internal Helpers

// constants
/** テスト対象の CLI エントリ `mutate-tester.ts` の絶対パス。 */
const _ENTRY_PATH = join(REPO_ROOT, 'scripts', 'testing', 'mutate-tester.ts');

// types
/** サブプロセスとして起動した mutate-tester の終了結果。 */
type _EntryResult = {
  /** 終了コード。 */
  code: number;
  /** 標準エラー出力 (UTF-8 でデコード済み)。 */
  stderr: string;
};

// functions
/**
 * リポジトリルートを作業ディレクトリとして `deno run -A mutate-tester.ts <args>` を実行する。
 *
 * 引数の解析で失敗する入力だけを渡すため、ロックの取得や変異テストの本実行には進まない。
 *
 * @param args - mutate-tester に渡す CLI 引数
 * @returns 終了コードと標準エラー出力
 */
async function _runEntry(args: string[]): Promise<_EntryResult> {
  const _output = await new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', _ENTRY_PATH, ...args],
    cwd: REPO_ROOT,
    stdout: 'null',
    stderr: 'piped',
  }).output();
  return { code: _output.code, stderr: new TextDecoder().decode(_output.stderr) };
}

// ─── Tests

/**
 * `mutate-tester.ts` を `deno run` で直接起動したときのエントリポイントのテストスイート。
 *
 * `if (import.meta.main)` ブロックが `main()` を呼び、引数の解析で投げられた例外を
 * 標準エラー出力へ書き出して失敗の終了コードで終わることを検証する。
 *
 * テスト ID 範囲: T-MUT-MTE-01-01 〜 T-MUT-MTE-02-01
 *
 * @see main
 * @see parseMutateArgs
 */
describe('mutate-tester (エントリポイント)', () => {
  /**
   * 引数の解析で失敗する起動。
   *
   * 不正な引数で起動したとき、何もせずに終了コード 0 で終わらず、失敗として終わることを検証する。
   */
  describe('引数の解析に失敗する', () => {
    /** 不正な引数で起動し、失敗の終了コードで終わるケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-MUT-MTE-01-01: 引数なしで起動 → 終了コード 1', async () => {
        const _result = await _runEntry([]);

        assertEquals(_result.code, EXIT_CODE_FAILURE);
      });

      it('[Error] T-MUT-MTE-01-02: 引数なしで起動 → stderr にモジュール名の欠落を示すメッセージを含む', async () => {
        const _result = await _runEntry([]);

        assertStringIncludes(_result.stderr, MISSING_MODULE_MESSAGE);
      });

      it('[Error] T-MUT-MTE-02-01: libs --dry-run (定義しないオプション) で起動 → 終了コード 1', async () => {
        const _result = await _runEntry(['libs', '--dry-run']);

        assertEquals(_result.code, EXIT_CODE_FAILURE);
      });
    });
  });
});
