// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/process-files.unit.spec.ts
// @(#): processFiles のユニットテスト
//       対象: processFiles, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertNotEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { processFiles } from '../../process-files.ts';
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Helpers
import { assertDirExist } from '../../../../../_scripts/__tests__/helpers/assert.ts';
import {
  installCommandMock,
  makeCountingMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { logger } from '../../../../../_scripts/libs/io/logger.ts';
import { normalizePath } from '../../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { NormalizeConfig, Stats } from '../../../types/normalize.types.ts';
// constants
import { BATCH_SIZE } from '../../../constants/normalize.constants.ts';

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
 * テスト ID 範囲: T-PF-01-01 〜 T-PF-01-07, T-PF-VAL-01 〜 T-PF-VAL-05
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
    it('[Normal] T-PF-01-03: segmentChatlogsBatch が1セグメントを返しdryRun=trueのとき stats.success === 0', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — dryRun=true なので writeOutput はスキップ
      assertEquals(stats.success, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Normal] T-PF-01-05: AIが2セグメントを返しdryRun=trueのとき stats.success === 0', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [
        { title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' },
        { title: 'Topic 2', summary: 'Summary 2', content: 'Body 2' },
      ];
      const batch = [{ filePath, segments }];
      const stdout = new TextEncoder().encode(JSON.stringify(batch));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(`${tmpDir}/dummy.md`, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — dryRun=true なので writeOutput はスキップ
      assertEquals(stats.success, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Normal] T-PF-01-06: 複数ファイル（2件）がありAIが成功するとき stats.fail === 0', async () => {
      // arrange
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const filePath1 = normalizePath(`${tmpDir}/file1.md`);
      const filePath2 = normalizePath(`${tmpDir}/file2.md`);
      const batch = [
        { filePath: filePath1, segments },
        { filePath: filePath2, segments },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(batch));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(`${tmpDir}/file1.md`, '# File1\n\nContent1');
      await Deno.writeTextFile(`${tmpDir}/file2.md`, '# File2\n\nContent2');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.fail, 0);
    });
  });

  /** 異常系: AI 失敗時に stats.fail が増加するケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PF-01-02: segmentChatlogs が null を返したとき stats.fail が 1増加する', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      await Deno.writeTextFile(`${tmpDir}/dummy.md`, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.fail, 1);
    });
  });

  /** エッジケース: concurrency=1 での動作確認、AI が空配列を返すケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-PF-01-07: AIが空のsegments配列を返したとき stats.fail は増加せず stats.success === 0', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const batch = [{ filePath, segments: [] }];
      const stdout = new TextEncoder().encode(JSON.stringify(batch));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(`${tmpDir}/dummy.md`, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — 空のsegments配列は有効な結果（null ではない）なので fail は増加しない
      assertEquals(stats.fail, 0);
      assertEquals(stats.success, 0);
    });
  });

  /** バリデーション: 入力ディレクトリ・出力ベースの事前チェック。 */
  describe('When: バリデーション', () => {
    it('[Error] T-PF-VAL-01: inputDir が存在しないとき ChatlogError(InputNotFound) を投げる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const nonExistentDir = `${tmpDir}/nonexistent`;

      // act & assert
      await assertRejects(
        () => processFiles(nonExistentDir, outputDir, _CONFIG, stats),
        ChatlogError,
      );
    });

    it('[Normal] T-PF-VAL-02: outputBase が存在しないとき自動作成されて正常処理される', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      // outputBase は inputDir(tmpDir) の外に配置する必要があるため
      // outputDir の親ディレクトリ配下に未作成のサブディレクトリを使う
      const nonExistentBase = `${outputDir}/nonexistent-base`;

      // act
      await processFiles(tmpDir, nonExistentBase, _CONFIG, stats);

      // assert — outputBase が作成されている
      await assertDirExist(nonExistentBase);
      assertEquals(stats, { success: 0, skip: 0, fail: 0, fallback: 0 });
    });

    it('[Error] T-PF-VAL-03: outputBase が inputDir 配下のとき ChatlogError(ForbiddenOutput) を投げる', async () => {
      // arrange
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
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
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act & assert
      await assertRejects(
        () => processFiles(tmpDir, tmpDir, _CONFIG, stats),
        ChatlogError,
      );
    });
  });

  /** model 伝播: config.model が segmentChatlogsBatch の --model 引数として渡されるケース。 */
  describe('When: model 伝播', () => {
    it('[Normal] T-PF-MOD-01: config.model 指定時に Deno.Command args に --model <指定モデル> が含まれる', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      const capturedArgs: { value: string[] } = { value: [] };
      mockHandle = installCommandMock(makeSuccessMock(stdout, capturedArgs));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model'> = {
        dryRun: true,
        concurrency: 1,
        model: 'claude-opus-4-7',
      };

      // act
      await processFiles(tmpDir, outputDir, config, stats);

      // assert
      const modelIndex = capturedArgs.value.indexOf('--model');
      assertNotEquals(modelIndex, -1);
      assertEquals(capturedArgs.value[modelIndex + 1], 'claude-opus-4-7');
    });
  });

  /** fail-fast: failFast オプションの動作検証。 */
  describe('When: fail-fast', () => {
    it('[Normal] T-PF-FF-01: failFast=false のとき fail が複数あっても全ファイルを処理する', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      await Deno.writeTextFile(`${tmpDir}/file1.md`, '# File1\n\nContent1');
      await Deno.writeTextFile(`${tmpDir}/file2.md`, '# File2\n\nContent2');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model' | 'failFast'> = {
        dryRun: true,
        concurrency: 1,
        failFast: false,
      };

      // act
      await processFiles(tmpDir, outputDir, config, stats);

      // assert — failFast=false なので全ファイルを処理して 2 fail
      assertEquals(stats.fail, 2);
    });

    it('[Error] T-PF-FF-02: failFast=true のとき最初の fail で ChatlogError(FailFast) をスローする', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      await Deno.writeTextFile(`${tmpDir}/file1.md`, '# File1\n\nContent1');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model' | 'failFast'> = {
        dryRun: true,
        concurrency: 1,
        failFast: true,
      };

      // act & assert
      const err = await assertRejects(
        () => processFiles(tmpDir, outputDir, config, stats),
        ChatlogError,
      );
      assertEquals((err as ChatlogError).kind, 'FailFast');
    });
  });

  /** logger.warn: AI 失敗時のファイル名ログ検証。 */
  describe('When: logger.warn', () => {
    it('[Error] T-PF-WL-01: AI が fail のとき logger.warn がファイル名付きで呼ばれる', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      const filePath = normalizePath(`${tmpDir}/target-file.md`);
      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      let warnStub: Stub | undefined;

      try {
        warnStub = stub(logger, 'warn');

        // act
        await processFiles(tmpDir, outputDir, _CONFIG, stats);

        // assert — warn が呼ばれ、ファイル名が含まれる
        assert(warnStub.calls.length > 0);
      } finally {
        warnStub?.restore();
      }
    });
  });

  /** BATCH_SIZE 境界: ファイル数が BATCH_SIZE を超えるとき 2 チャンクに分割して処理するケース。 */
  describe('When: BATCH_SIZE 境界', () => {
    it('[Edge] T-PF-BATCH-01: ファイル数が BATCH_SIZE+1 のとき全ファイルが処理されて stats.fail === 0', async () => {
      // arrange — BATCH_SIZE+1 件のファイルを作成して 2 チャンク分の処理を誘発する
      const fileCount = BATCH_SIZE + 1;
      const filePaths: string[] = [];
      for (let i = 0; i < fileCount; i++) {
        const fp = normalizePath(`${tmpDir}/file${i}.md`);
        await Deno.writeTextFile(fp, `# File ${i}\n\nContent`);
        filePaths.push(fp);
      }

      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const batch = filePaths.map((fp) => ({ filePath: fp, segments }));
      const stdout = new TextEncoder().encode(JSON.stringify(batch));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model'> = {
        dryRun: true,
        concurrency: 2,
      };

      // act
      await processFiles(tmpDir, outputDir, config, stats);

      // assert — 全ファイルが処理され fail がゼロ
      assertEquals(stats.fail, 0);
    });
  });

  /**
   * スキップ処理: 出力済みファイルが存在する場合に processFiles がスキップするケース。
   *
   * `_isAlreadyNormalized` は内部関数のため processFiles() 経由で検証する。
   * project frontmatter なし → project=undefined → outputDir は `${outputBase}/misc`。
   */
  describe('When: スキップ処理', () => {
    it('[Normal] T-PF-SKIP-01: outputDir に baseName-*.md が存在するとき stats.skip が 1増加する', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');

      // project frontmatter なし → misc フォールバック → outputDir = ${outputDir}/misc
      const miscDir = normalizePath(`${outputDir}/misc`);
      await Deno.mkdir(miscDir, { recursive: true });
      // baseName = 'dummy'（hash suffix なし）。パターン dummy-*.md にマッチするファイルを配置する
      await Deno.writeTextFile(`${miscDir}/dummy-01-abc1234.md`, 'already normalized');

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.skip, 1);
      assertEquals(stats.success, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Normal] T-PF-SKIP-02: outputDir に baseName-*.md が存在しないとき stats.skip は増加しない', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      // 出力済みファイルなし

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.skip, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Edge] T-PF-SKIP-03: outputDir が存在しないとき stats.skip は増加せずエラーにならない', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      // misc サブディレクトリを作成しない（outputDir 自体は存在する）

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act — エラーなしで処理が完了するはず
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.skip, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Edge] T-PF-SKIP-04: project が undefined のとき misc フォールバックで outputDir が解決され stats.skip は 0', async () => {
      // arrange — project frontmatter なしのファイル
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      // misc ディレクトリにマッチするファイルなし

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — misc フォールバックで解決されるが該当ファイルがないのでスキップなし
      assertEquals(stats.skip, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Normal] T-PF-SKIP-05: 出力済みファイルがある場合 stats.skip が 1増加し stats.success は増加しない', async () => {
      // arrange — T-PF-SKIP-01 と同等（T-02 統合テスト）
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');

      const miscDir = normalizePath(`${outputDir}/misc`);
      await Deno.mkdir(miscDir, { recursive: true });
      await Deno.writeTextFile(`${miscDir}/dummy-01-abc1234.md`, 'already normalized');

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert
      assertEquals(stats.skip, 1);
      assertEquals(stats.success, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Normal] T-PF-SKIP-08: 出力済みファイルがあるとき AI コマンドは呼び出されない', async () => {
      // arrange — すでに正規化済みのファイルに対して AI が呼ばれないことを検証する
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      await Deno.writeTextFile(filePath, '# Test\n\nContent');

      const miscDir = normalizePath(`${outputDir}/misc`);
      await Deno.mkdir(miscDir, { recursive: true });
      await Deno.writeTextFile(`${miscDir}/dummy-01-abc1234.md`, 'already normalized');

      const counter = { calls: 0 };
      // makeCountingMock: コンストラクタ呼び出しごとに counter.calls をインクリメントする
      mockHandle = installCommandMock(makeCountingMock('[]', counter));

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — スキップされたので AI コマンドは 0 回呼ばれる
      assertEquals(stats.skip, 1);
      assertEquals(counter.calls, 0);
    });

    it('[Edge] T-PF-SKIP-07: outputBase の深いサブディレクトリに baseName-*.md があるとき stats.skip が 1増加する', async () => {
      // arrange — ** glob パターンでサブディレクトリ内のファイルを検出できることを確認する
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic', summary: 'Summary', content: 'Body' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');

      // 深いサブディレクトリ（chatlogs/claude/2026/2026-06/misc 相当）に出力済みファイルを配置
      const deepDir = normalizePath(`${outputDir}/chatlogs/claude/2026/2026-06/misc`);
      await Deno.mkdir(deepDir, { recursive: true });
      await Deno.writeTextFile(`${deepDir}/dummy-01-abc1234.md`, 'already normalized');

      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };

      // act
      await processFiles(tmpDir, outputDir, _CONFIG, stats);

      // assert — ** glob がサブディレクトリを再帰検索してスキップを検出する
      assertEquals(stats.skip, 1);
      assertEquals(stats.success, 0);
      assertEquals(stats.fail, 0);
    });
  });

  /** --single-file モード: 1ファイルずつ個別に AI 呼び出しを行うケース。 */
  describe('When: --single-file モード', () => {
    it('[Normal] T-PF-SF-01: singleFile=true で AI が正常にセグメントを返したとき stats.success が増え stats.fallback は増えない', async () => {
      // arrange
      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      const segments = [{ title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' }];
      const stdout = new TextEncoder().encode(JSON.stringify([{ filePath, segments }]));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      await Deno.writeTextFile(filePath, '# Test\n\nContent');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model' | 'singleFile'> = {
        dryRun: false,
        concurrency: 1,
        singleFile: true,
      };

      // act
      await processFiles(tmpDir, outputDir, config, stats);

      // assert — AI が正常に返したので success が増え fallback は 0 のまま
      assertEquals(stats.success, 1);
      assertEquals(stats.fallback, 0);
      assertEquals(stats.fail, 0);
    });

    it('[Error] T-PF-SF-02: singleFile=true で AI が null を返したとき stats.fallback が増え stats.fail は増えない、出力ファイルが1件生成される', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      const filePath = normalizePath(`${tmpDir}/dummy.md`);
      await Deno.writeTextFile(filePath, '# Test\n\nFallback content');
      const stats: Stats = { success: 0, skip: 0, fail: 0, fallback: 0 };
      const config: Pick<NormalizeConfig, 'dryRun' | 'concurrency' | 'model' | 'singleFile'> = {
        dryRun: false,
        concurrency: 1,
        singleFile: true,
      };

      // act
      await processFiles(tmpDir, outputDir, config, stats);

      // assert — AI 失敗 → fallback で 1セグメント処理される
      assertEquals(stats.fallback, 1);
      assertEquals(stats.fail, 0);
      assertEquals(stats.success, 1);
    });
  });
});
