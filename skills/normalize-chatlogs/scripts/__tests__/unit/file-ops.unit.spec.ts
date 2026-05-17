// src: scripts/__tests__/unit/normalize-chatlogs.file-ops.unit.spec.ts
// @(#): ファイル操作関数のユニットテスト
//       対象: writeOutput, segmentChatlogs
//       (collectMdFiles/findFiles は _scripts/libs/find-files.ts に移管済み)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertNull } from '../../../../_scripts/libs/testing/assert.ts';

// test helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// exists
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { fileOrDirExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';

// test target
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import {
  segmentChatlogs,
  writeOutput,
} from '../../normalize-chatlogs.ts';
import type { Stats } from '../../normalize-chatlogs.ts';

// ─── writeOutput tests ───────────────────────────────────────────────────────

/**
 * writeOutput のユニットテスト。
 * Deno.makeTempDir を使ってテンポラリディレクトリにファイルを書き込む実際のファイル操作テスト。
 */
describe('writeOutput', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: 'normalize-chatlogs-test-' });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  /** 正常系: dryRun=false のとき、ファイルが書き込まれ stats.success が 1 増える */
  describe('[正常] Normal Cases', () => {
    it('T-WO-01-01: ファイルが書き込まれ stats.success が 1 増える', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const content = '# Test Content\nHello World';
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await writeOutput(outputPath, content, false, stats);

      // assert
      const written = await readTextFile(outputPath);
      assertEquals(written, content);
      assertEquals(stats.success, 1);
    });

    it('T-WO-02-01: 既存ファイルが .old-01.md にバックアップされ新ファイルが書かれる', async () => {
      // arrange
      const outputPath = `${tmpDir}/output.md`;
      const oldContent = 'old content';
      const newContent = 'new content';
      await Deno.writeTextFile(outputPath, oldContent);
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await writeOutput(outputPath, newContent, false, stats);

      // assert
      const backupPath = `${tmpDir}/output.old-01.md`;
      const backupContent = await readTextFile(backupPath);
      const written = await readTextFile(outputPath);
      assertEquals(backupContent, oldContent);
      assertEquals(written, newContent);
      assertEquals(stats.success, 1);
    });
  });

  /** 異常系: dryRun=true のとき、ファイルは書き込まれず stats が変化しない */
  describe('[異常] Dry-run Cases', () => {
    it('T-WO-03-01: dryRun=true のときファイルは書き込まれず stats.success が増えない', async () => {
      // arrange
      const outputPath = `${tmpDir}/output-dryrun.md`;
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      await writeOutput(outputPath, 'content', true, stats);

      // assert
      assertEquals(await fileOrDirExists(outputPath), false);
      assertEquals(stats.success, 0);
    });
  });

  /** 異常系: R-010 ガード — outputPath に chatlogs/ が含まれるとき Error をスロー */
  describe('[異常] R-010 Guard Cases', () => {
    it('T-WO-04-01: outputPath に chatlogs/ が含まれるとき Error をスロー', async () => {
      // arrange
      const outputPath = 'chatlogs/agent/2026/2026-01/output.md';
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act & assert
      await assertRejects(
        () => writeOutput(outputPath, 'content', false, stats),
        Error,
        'Forbidden Output',
      );
    });

    it('T-WO-04-02: throw された ChatlogError の subindex が "ForbiddenPath" になる', async () => {
      // arrange
      const outputPath = 'chatlogs/agent/2026/2026-01/output.md';
      const stats: Stats = { success: 0, skip: 0, fail: 0 };

      // act
      const err = await writeOutput(outputPath, 'content', false, stats).catch((e) => e);

      // assert
      assertEquals((err as ChatlogError).subindex, 'ForbiddenPath');
    });
  });
});

// ─── segmentChatlogs tests ─────────────────────────────────────────────────────

/**
 * segmentChatlogs のユニットテスト。
 * Deno.Command をモックして AI 呼び出しを制御する。
 */
describe('segmentChatlogs', () => {
  let mockHandle: CommandMockHandle;

  afterEach(() => {
    if (mockHandle) {
      mockHandle.restore();
    }
  });

  /** 正常系: AI が有効な JSON 配列を返すとき Segment 配列を返す */
  describe('[正常] Normal Cases', () => {
    it('T-SC-01-01: AI が有効な JSON 配列を返すとき Segment 配列を返す', async () => {
      // arrange
      const segments = [
        { title: 'Topic 1', summary: 'Summary 1', content: 'Body 1' },
        { title: 'Topic 2', summary: 'Summary 2', content: 'Body 2' },
      ];
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertEquals(result, segments);
    });
  });

  /** 異常系: AI が非ゼロ exit code で終了するとき null を返す */
  describe('[異常] Error Cases', () => {
    it('T-SC-02-01: AI が非ゼロ exit code で終了するとき null を返す', async () => {
      // arrange
      mockHandle = installCommandMock(makeFailMock(1));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertNull(result);
    });

    it('T-SC-03-01: AI が JSON でない文字列を返すとき null を返す', async () => {
      // arrange
      const stdout = new TextEncoder().encode('This is not JSON at all.');
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertNull(result);
    });
  });

  /** エッジケース: セグメントが MAX_SEGMENTS(10) を超えるとき先頭10件のみ返す */
  describe('[エッジケース] Edge Cases', () => {
    it('T-SC-04-01: 12件のセグメントが返るとき先頭10件のみに制限される', async () => {
      // arrange
      const segments = Array.from({ length: 12 }, (_, i) => ({
        title: `Topic ${i + 1}`,
        summary: `Summary ${i + 1}`,
        content: `Body ${i + 1}`,
      }));
      const stdout = new TextEncoder().encode(JSON.stringify(segments));
      mockHandle = installCommandMock(makeSuccessMock(stdout));

      // act
      const result = await segmentChatlogs('test.md', 'content');

      // assert
      assertEquals(result?.length, 10);
      assertEquals(result?.[0].title, 'Topic 1');
      assertEquals(result?.[9].title, 'Topic 10');
    });
  });
});
