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
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeTempDirs, removeTempDirs } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

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

      // Build batch responses for all 4 files — they are processed as 1 batch (BATCH_SIZE=4)
      const batchResponse = JSON.stringify(
        Array.from({ length: 4 }, (_, i) => ({
          filePath: normalizePath(`${inputDir}/chat-${i + 1}.md`),
          segments: [{ title: `Topic ${i + 1}`, summary: `Summary ${i + 1}`, content: `Body ${i + 1}` }],
        })),
      );
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(batchResponse)),
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

  // ─── T-15-03-02: バッチ全体失敗時の集計 ────────────────────────────────────

  /**
   * 異常系: AI がバッチ全体で exit 失敗 → 全 3 ファイルが fail に集計される。
   *
   * 注: バッチ処理 (BATCH_SIZE=4) では 3 ファイルが 1 回の AI 呼び出しで処理される。
   * AI 呼び出し自体が失敗した場合、バッチ内の全ファイルが fail としてカウントされる。
   */
  describe('Given: 3 件の MD ファイルのうち AI がバッチ全体で失敗する', () => {
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

      commandHandle = installCommandMock(makeFailMock(1));
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-03-02 - AI バッチ呼び出し失敗でバッチ内全ファイルが fail にカウントされる', () => {
        it('T-15-03-02-01: fail=3 がレポートに含まれる', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir]);

          assertMatch([...loggerStub.infoLogs, ...loggerStub.warnLogs].join('\n'), /fail=3/);
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
