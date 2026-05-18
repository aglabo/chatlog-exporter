#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlogs-aggregation.e2e.spec.ts
// @(#): main() の集計検証 E2E テスト
//       success / skip / fail カウントが reportResults に正しく反映されることを確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertMatch } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── helpers ──────────────────────────────────────────────────────────────────

import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  installCommandMock,
  makeSelectiveFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeTempDirs, removeTempDirs } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// test target
import { main } from '../../normalize-chatlogs.ts';

// ─── 集計テスト ────────────────────────────────────────────────────────────────

/**
 * success / skip / fail カウントの集計検証。
 * reportResults() が出力する "Results: success=N, skip=N, fail=N" 形式を検証する。
 */
describe('main - aggregation', () => {
  // ─── T-15-01-02: 並列処理の全件成功集計 ─────────────────────────────────────

  /** 正常系: 4 件の MD ファイルを並列処理し全件 success=4 を報告する */
  describe('Given: 4 件の MD ファイルを含むディレクトリとデフォルト並列数 4', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      for (let i = 1; i <= 4; i++) {
        await Deno.writeTextFile(
          `${inputDir}/chat-${i}.md`,
          `### User\nQuestion ${i}\n\n### AI\nAnswer ${i}`,
        );
      }

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary', body: 'Body' },
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

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-01-02 - withConcurrency を使ってファイルを並列処理する', () => {
        it('T-15-01-02-01: 全 4 件が処理されて結果レポートに success=4 が含まれる', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir]);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=4/);
        });
      });
    });
  });

  // ─── T-15-03-02: 部分失敗時の集計 ───────────────────────────────────────────

  /** 異常系: 3 件のうち 1 件が AI エラー → success=2, fail=1 */
  describe('Given: 3 件の MD ファイルのうち 1 件が AI エラーを起こす', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      for (let i = 1; i <= 3; i++) {
        await Deno.writeTextFile(
          `${inputDir}/chat-0${i}.md`,
          `### User\nQ${i}\n\n### AI\nA${i}`,
        );
      }

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary', body: 'Body' },
      ]);
      const successBytes = new TextEncoder().encode(segmentResponse);
      commandHandle = installCommandMock(makeSelectiveFailMock(3, successBytes));
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-03-02 - 1 ファイルの AI 呼び出し失敗でも残りファイルの処理を継続する', () => {
        it('T-15-03-02-01: success=2 かつ fail=1 がレポートに含まれる', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir]);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=2/);
          assertMatch([...loggerStub.infoLogs, ...loggerStub.warnLogs].join('\n'), /fail=1/);
        });
      });
    });
  });

  // ─── T-15-04-01: 空ディレクトリの 0 件集計 ──────────────────────────────────

  /** エッジケース: 空ディレクトリで 0 件レポートを出力する */
  describe('Given: .md ファイルが存在しない空ディレクトリ', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      commandHandle = installCommandMock(makeSuccessMock(new Uint8Array()));
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-04-01 - 空ディレクトリでも完了し 0 件レポートを出力する', () => {
        it('T-15-04-01-01: success=0, skip=0, fail=0 がレポートに含まれる', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir]);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=0.*skip=0.*fail=0/);
        });
      });
    });
  });
});
