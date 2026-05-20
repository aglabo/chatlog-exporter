#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlogs-reproducibility.e2e.spec.ts
// @(#): main() の再現性検証 E2E テスト
//       再実行時のスキップ動作 (R-011) と入力ファイル不変保証 (R-010) を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ───  Deno Test module
import { assertEquals, assertMatch } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../normalize-chatlogs.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────
// mock
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// stub
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// functions
import {
  makeTempDirs,
  removeTempDirs,
  silenceLog,
} from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { findFiles } from '../../../../_scripts/libs/file-ops/find-files.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LogSilencer } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { HashProvider } from '../../../../_scripts/types/providers.types.ts';

// ─── 再現性テスト ──────────────────────────────────────────────────────────────

/**
 * 再実行時のバックアップ動作と入力ファイル不変保証の検証。
 * R-011: 既存出力ファイルは .old-NN.md にリネームされてから再書き込みされる。
 * R-010: 入力ファイルは処理後も変化しない。
 */
describe('main - reproducibility', () => {
  // ─── T-15-04-02: 再実行時のバックアップ ──────────────────────────────────────

  /** エッジケース: 再実行時に既存出力ファイルをバックアップして再書き込みする (R-011) */
  describe('Given: 出力ファイルがすでに存在する処理済み入力ファイル', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '### User\nHello\n\n### AI\nHi',
      );

      const chatPath = normalizePath(`${inputDir}/chat.md`);
      const segmentResponse = JSON.stringify([
        { filePath: chatPath, segments: [{ title: 'Topic', summary: 'Summary', content: 'Body' }] },
      ]);
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(segmentResponse)),
      );
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main() を同一入力で 2 回呼び出す', () => {
      describe('Then: Task T-15-04-02 - 再実行時に既存出力ファイルをバックアップして再書き込みする', () => {
        it('T-15-04-02-01: 2 回目の呼び出しで success=1 がレポートに含まれ、旧ファイルが .old-01.md としてバックアップされる', async () => {
          // Fixed hash so both runs generate the same output filename
          const fixedHash: HashProvider = () => '0000000';

          // First run: creates output
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir], fixedHash);

          // Reset log capture for second run
          loggerStub.infoLogs.splice(0);

          // Second run: should backup existing file and rewrite
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir], fixedHash);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);

          // Verify the old file was backed up as .old-01.md (search recursively under outputDir)
          const allFiles = await findFiles(outputDir);
          const backupExists = allFiles.some((path) => path.includes('.old-01.md'));
          assertEquals(backupExists, true);
        });
      });
    });
  });

  // ─── T-15-04-03: 入力ファイル不変保証 ───────────────────────────────────────

  /** エッジケース: 実行後も入力ファイルの内容が変化しない (R-010) */
  describe('Given: 既知の内容を持つ入力 MD ファイル', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;
    const inputContent = '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi';

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(`${inputDir}/input.md`, inputContent);

      const inputPath = normalizePath(`${inputDir}/input.md`);
      const segmentResponse = JSON.stringify([
        { filePath: inputPath, segments: [{ title: 'Topic', summary: 'Summary', content: 'Body' }] },
      ]);
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(segmentResponse)),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main() が完了する', () => {
      describe('Then: Task T-15-04-03 - 実行全体を通じて入力ファイルが変更されない', () => {
        it('T-15-04-03-01: 入力ファイルの内容が main() 実行後も変化しない', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir]);

          const afterContent = await readTextFile(`${inputDir}/input.md`);
          assertEquals(afterContent, inputContent);
        });
      });
    });
  });
});
