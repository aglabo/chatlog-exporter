// src: scripts/__tests__/system/strip/strip-main.system.spec.ts
// @(#): strip-chatlogs の受理ゲート拒否時の終了コード検証（実プロセス起動）
//       対象: strip-chatlogs.ts のエントリポイント（import.meta.main ブロック）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertNotEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
const _SCRIPT_PATH = new URL('../../../strip-chatlogs.ts', import.meta.url).pathname;

// ─── Internal Helpers

// constants

/**
 * 受理ゲートを通過しうる `<agent> <YYYY-MM>`。他ケースと同じ形を使い、
 * 拒否が「出力先の指定」に由来することを条件の差分だけで説明できるようにする。
 */
const _TARGET = ['claude', '2026-03'];

/** 出力先の override として与えるパス。ゲートが列挙より前に拒否するため実在する必要はない。 */
const _OUTPUT_DIR = './safe-copy';

// types

/** サブプロセス実行の結果。終了コードと stderr を併せて観測する。 */
interface _RunResult {
  /** プロセスの終了コード。 */
  code: number;
  /** プロセスの stderr 出力（デコード済み）。 */
  stderr: string;
}

// functions

/**
 * `strip-chatlogs.ts` を実プロセスとして起動し、終了コードと stderr を取得する。
 *
 * `Deno.exit` を同一プロセス内で呼ぶとテストランナーごと停止するため、終了コードの
 * 検証はサブプロセス起動でのみ行える。`stderr` を `piped` で捕捉するのは、
 * 終了コード 1 が受理ゲートの拒否によるものか、権限エラー等の別要因によるものかを
 * 区別するため（コードだけの検証は偽陽性になりうる）。
 *
 * @param args - `strip-chatlogs.ts` へ渡す CLI 引数
 * @returns 終了コードと stderr 出力
 */
const _runStrip = async (args: string[]): Promise<_RunResult> => {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', _SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'piped',
  });
  const { code, stderr } = await _cmd.output();
  return { code, stderr: new TextDecoder().decode(stderr) };
};

// ─── Tests

/**
 * `strip-chatlogs` のエントリポイントのシステムテストスイート。
 *
 * 受理ゲート（R-001）が `ChatlogError` を送出したとき、`import.meta.main` ブロックが
 * これを捕捉して成功以外の終了コードでプロセスを終了させることを検証する（DR-20）。
 *
 * テスト ID 範囲: T-FL-SEP-02-04
 *
 * @see main
 */
describe('strip-chatlogs (system)', () => {
  /**
   * 受理ゲート拒否時の終了コード（R-001 / DR-20）。
   *
   * 拒否が終了コードに反映されないと、呼び出し側の SKILL.md 層が失敗を検知できず
   * 未処理のまま後続処理へ進んでしまう。
   */
  describe('受理ゲート拒否時の終了コード (R-001 / DR-20)', () => {
    /** 受理範囲外の起動でプロセスが異常終了するケース。 */
    describe('When: 異常系', () => {
      it('[Error] T-FL-SEP-02-04-01: 年月を省略した起動は成功以外の終了コードで終了する', async () => {
        const { code, stderr } = await _runStrip(['claude']);

        assertNotEquals(code, 0);
        // 終了コード 1 が権限エラー等ではなく受理ゲートの拒否に由来することを確認する
        assertStringIncludes(stderr, 'strip は年月の指定を必須とします');
      });

      it('[Error] T-FL-SEP-02-04-02: --input-dir を指定した起動は成功以外の終了コードで終了する', async () => {
        const { code, stderr } = await _runStrip(['claude', '2026-03', '--input-dir', '/nonexistent/strip-target']);

        assertNotEquals(code, 0);
        assertStringIncludes(stderr, 'strip は入力ディレクトリの指定を受理しません');
      });

      // 対象は実在しうる `<agent> <YYYY-MM>` を渡す。受理ゲートが列挙より前に拒否するため
      // 実際には到達しないが、ゲートが失われた場合に実データを書き換えないよう `--dry-run` を併記する
      it('[Error] T-FL-SEP-02-04-03: 第 3 位置引数の出力先を指定した起動は成功以外の終了コードで終了する', async () => {
        const { code, stderr } = await _runStrip([..._TARGET, _OUTPUT_DIR, '--dry-run']);

        assertNotEquals(code, 0);
        assertStringIncludes(stderr, 'strip は出力ディレクトリの指定を受理しません');
      });

      it('[Error] T-FL-SEP-02-04-04: --output-dir を指定した起動は成功以外の終了コードで終了する', async () => {
        const { code, stderr } = await _runStrip([..._TARGET, `--output-dir=${_OUTPUT_DIR}`, '--dry-run']);

        assertNotEquals(code, 0);
        assertStringIncludes(stderr, 'strip は出力ディレクトリの指定を受理しません');
      });
    });
  });
});
