// src: scripts/__tests__/fixtures/helpers/fixture-helpers.unit.spec.ts
// @(#): collectOutputFiles ユニットテスト
//       対象: collectOutputFiles — output-<N>.md を番号順に収集する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { collectOutputFiles } from './fixture-helpers.ts';

// ─── Internal Helpers

// functions

/**
 * 一時ディレクトリを作成し、指定ファイル名（空ファイル）を配置して返す。
 *
 * @param fileNames - 作成するファイル名の配列
 * @returns 一時ディレクトリのパス（スラッシュ区切り）
 */
async function _makeTempDir(fileNames: string[]): Promise<string> {
  const dir = await Deno.makeTempDir();
  for (const name of fileNames) {
    await Deno.writeTextFile(`${dir}/${name}`, '');
  }
  return dir.replaceAll('\\', '/');
}

// ─── Tests

/**
 * `collectOutputFiles` のユニットテストスイート。
 *
 * output-<N>.md の収集・フィルタリング・ソート順を検証する。
 *
 * テスト ID 範囲: T-NFH-CO-01 〜 T-NFH-CO-03
 *
 * @see collectOutputFiles
 */
describe('collectOutputFiles', () => {
  /**
   * ソートと収集の基本動作テスト。
   *
   * output-1.md〜3.md の番号順収集・他ファイル除外・2桁数値の正しい順序を検証する。
   */
  describe('When: 正常系', () => {
    let tempDir: string;

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    it('[Normal] T-NFH-CO-01: output-1.md, output-2.md, output-3.md を番号順で返す', async () => {
      tempDir = await _makeTempDir(['output-3.md', 'output-1.md', 'output-2.md']);
      const result = await collectOutputFiles(tempDir);
      assertEquals(result, [
        `${tempDir}/output-1.md`,
        `${tempDir}/output-2.md`,
        `${tempDir}/output-3.md`,
      ]);
    });

    it('[Normal] T-NFH-CO-02: output-*.md 以外のファイルは結果に含まれない', async () => {
      tempDir = await _makeTempDir(['output-1.md', 'input.md', 'output-1.txt', 'README.md']);
      const result = await collectOutputFiles(tempDir);
      assertEquals(result, [`${tempDir}/output-1.md`]);
    });
  });

  describe('When: エッジケース', () => {
    let tempDir: string;

    afterEach(async () => {
      await Deno.remove(tempDir, { recursive: true });
    });

    it('[Edge] T-NFH-CO-03: output-1.md, output-2.md, output-10.md を数値順（辞書順でなく）で返す', async () => {
      tempDir = await _makeTempDir(['output-10.md', 'output-2.md', 'output-1.md']);
      const result = await collectOutputFiles(tempDir);
      assertEquals(result, [
        `${tempDir}/output-1.md`,
        `${tempDir}/output-2.md`,
        `${tempDir}/output-10.md`,
      ]);
    });
  });
});
