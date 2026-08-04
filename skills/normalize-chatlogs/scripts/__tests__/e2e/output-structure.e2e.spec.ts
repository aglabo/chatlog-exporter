#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlogs-output-structure.e2e.spec.ts
// @(#): main() の出力ファイル構造検証 E2E テスト
//       YAML frontmatter と ## Summary セクションの存在を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── helpers ──────────────────────────────────────────────────────────────────

import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { makeTempDirs, removeTempDirs } from '../../../../_cle-libs/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { assertAllOutputFiles } from '../../../../_cle-libs/__tests__/helpers/output-validator.ts';
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';

// test target
import { findFiles } from '../../../../_cle-libs/libs/file-ops/find-files.ts';
import { main } from '../../normalize-chatlogs.ts';

// ─── Internal Helpers

// functions

/**
 * テスト用 `GlobalConfig` インスタンスを `cacheDir` 指定の YAML で生成する。
 *
 * `GlobalConfig.resetInstance()` 済みであることを前提に、`normalize-cache` を
 * `tempDir` 配下に隔離し、他テストの残留キャッシュの影響を防ぐ。
 *
 * @param tempDir - キャッシュディレクトリの起点となる一時ディレクトリパス
 */
const _makeGlobalConfig = (tempDir: string): GlobalConfig =>
  GlobalConfig.getInstance({ yaml: `cacheDir: '${tempDir}/cache'` });

// ─── 構造テスト ────────────────────────────────────────────────────────────────

/**
 * 出力ファイルの内部構造検証。
 * 各出力ファイルが YAML frontmatter (---\n...\n---) と ## Summary セクションを
 * 持つことを assertAllOutputFiles で確認する。
 */
describe('main - output structure', () => {
  // ─── T-15-01-01-02: frontmatter 付き出力ファイルの構造 ──────────────────────

  /** 正常系: 各出力ファイルが YAML frontmatter を含む */
  describe('Given: frontmatter 付き MD ファイルが存在するディレクトリを --dir で指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);

      await Deno.writeTextFile(
        `${inputDir}/chat-a.md`,
        '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi',
      );
      await Deno.writeTextFile(
        `${inputDir}/chat-b.md`,
        '---\nproject: test\n---\n### User\nFix CI\n\n### AI\nSure',
      );

      const pathA = normalizePath(`${inputDir}/chat-a.md`);
      const pathB = normalizePath(`${inputDir}/chat-b.md`);
      const segmentResponse = JSON.stringify([
        { filePath: pathA, segments: [{ title: 'Topic A', summary: 'Summary A', startLine: 1, endLine: 2 }] },
        { filePath: pathB, segments: [{ title: 'Topic B', summary: 'Summary B', startLine: 1, endLine: 2 }] },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      GlobalConfig.resetInstance();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-01-01-02 - 各出力ファイルが YAML frontmatter を含む', () => {
        it('T-15-01-01-02-01: 各出力ファイルが ---\\n で始まる YAML frontmatter と ## Summary セクションを含む', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir]);

          const files = await findFiles(outputDir);
          await assertAllOutputFiles(files);
        });
      });
    });
  });

  // ─── frontmatter フィールド伝播の検証 ───────────────────────────────────────

  /** 正常系: 入力の project フィールドが出力 frontmatter に伝播される */
  describe('Given: project フィールドを持つ frontmatter 付き MD ファイル', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '---\nproject: my-project\n---\n### User\nHello\n\n### AI\nHi',
      );

      const chatPath = normalizePath(`${inputDir}/chat.md`);
      const segmentResponse = JSON.stringify([
        {
          filePath: chatPath,
          segments: [{ title: 'Greeting', summary: 'A greeting exchange', content: '### User\nHello' }],
        },
      ]);
      commandHandle = installCommandMock(
        makeClaudeJsonMock(segmentResponse),
      );
      loggerStub = makeLoggerStub();
    });

    afterEach(async () => {
      commandHandle.restore();
      loggerStub.restore();
      GlobalConfig.resetInstance();
      await removeTempDirs(inputDir, outputDir);
    });

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: 入力の project フィールドが出力 frontmatter に伝播される', () => {
        it('出力ファイルの frontmatter に project: my-project が含まれる', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir]);

          const files = await findFiles(outputDir);
          await assertAllOutputFiles(files, {
            expectFrontmatterField: { key: 'project', value: 'my-project' },
          });
        });
      });
    });
  });
});
