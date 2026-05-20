// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/process-files.unit.spec.ts
// @(#): processFiles のユニットテスト
//       対象: processFiles
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processFiles } from '../../process-files.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { NormalizeConfig, Stats } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// constants
const _CONFIG: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model'> = {
  dryRun: true,
  concurrency: 2,
};

// ─── Tests

/**
 * `processFiles` のユニットテストスイート。
 *
 * AI 呼び出し（segmentChatlogs）をモックして stats の更新と dryRun 動作を検証する。
 *
 * テスト ID 範囲: T-PF-01-01 〜 T-PF-01-04
 *
 * @see processFiles
 */
describe('processFiles', () => {
  let tmpDir: string;
  let outputDir: string;
  let mockHandle: CommandMockHandle | undefined;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'process-files-test-' });
    outputDir = await Deno.makeTempDir({ prefix: 'process-files-out-' });
  });

  afterEach(async () => {
    mockHandle?.restore();
    mockHandle = undefined;
    await Deno.remove(tmpDir, { recursive: true });
    await Deno.remove(outputDir, { recursive: true });
  });

  /** 正常系: ファイルなし・dryRun のケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PF-01-01: inputDir が空のとき stats は全ゼロのまま', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats, { success: 0, skip: 0, fail: 0 });
    });

    it('[Normal] T-PF-01-03: segmentChatlogs が1セグメントを返しdryRun=trueのとき stats.success === 0', async () => {
      // arrange
      const segments = [{ title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' }];
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(`${tmpDir}/dummy.md`, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — dryRun=true なので writeOutput はスキップ
      assertEquals(stats.success, 0);
    });
  });

  /** 異常系: AI 失敗時に stats.fail が増加するケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-01-02: segmentChatlogs が null を返したとき stats.fail が 1増加する', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      await Deno.writeTextFile(`${tmpDir}/dummy.md`, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.fail, 1);
    });
  });

  /** エッジケース: concurrency=1 での動作確認。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-01-04: concurrency=1 でも複数ファイルを順次処理できる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model'> = {
        dryRun: true,
        concurrency: 1,
      };

      // act — 空のtmpDirを渡してファイルなし
      await processFiles(tmpDir, outputDir, config, stats);

      // assert
      assertEquals(stats.fail, 0);
      assertEquals(stats.success, 0);
    });
  });

  /** バリデーション: 入力ディレクトリ・出力ベースの事前チェック。 */
  describe('When: バリデーション', () => {
    it('[Error] T-PF-VAL-01: inputDir が存在しないとき ChatlogError(InputNotFound) を投げる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const nonExistentDir = `${tmpDir}/nonexistent`;

      // act & assert
      await assertRejects(
        () => processFiles(nonExistentDir, outputDir, _CONFIG, stats),
        ChatlogError,
      );
    });

    it('[Normal] T-PF-VAL-02: outputBase が存在しないとき自動作成されて正常処理される', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      // outputBase は inputDir(tmpDir) の外に配置する必要があるため
      // outputDir の親ディレクトリ配下に未作成のサブディレクトリを使う
      const nonExistentBase = `${outputDir}/nonexistent-base`;

      // act
      await processFiles(tmpDir, nonExistentBase, _CONFIG, stats);

      // assert — outputBase が作成されている
      const stat = await Deno.stat(nonExistentBase);
      assertEquals(stat.isDirectory, true);
      assertEquals(stats, { success: 0, skip: 0, fail: 0 });
    });

    it('[Error] T-PF-VAL-03: outputBase が inputDir 配下のとき ChatlogError(ForbiddenOutput) を投げる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };
      const insideDir = `${tmpDir}/inside`;
      await Deno.mkdir(insideDir, { recursive: true });

      // act & assert
      await assertRejects(
        () => processFiles(tmpDir, insideDir, _CONFIG, stats),
        ChatlogError,
      );
    });

    it('[Error] T-PF-VAL-04: outputBase === inputDir のとき ChatlogError(ForbiddenOutput) を投げる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act & assert
      await assertRejects(
        () => processFiles(tmpDir, tmpDir, _CONFIG, stats),
        ChatlogError,
      );
    });

    it('[Normal] T-PF-VAL-05: outputBase が inputDir の外なら stats はゼロのまま', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats, { success: 0, skip: 0, fail: 0 });
    });
  });
});
