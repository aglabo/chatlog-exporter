#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlog-io.e2e.spec.ts
// @(#): main() の I/O 検証 E2E テスト
//       ファイル生成・ディレクトリ解決（--dir / --agent --year-month）・エラー終了を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals, assertMatch } from '@std/assert';
import { after, afterEach, before, beforeEach, describe, it } from '@std/testing/bdd';

// ─── helpers ──────────────────────────────────────────────────────────────────

import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LogSilencer } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import {
  makeTempDirs,
  removeTempDirs,
  silenceLog,
} from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// test target
import { findFiles } from '../../../../_scripts/libs/file-ops/find-files.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
import { main } from '../../normalize-chatlog.ts';
import type { HashProvider } from '../../normalize-chatlog.ts';

// ─── I/O テスト ────────────────────────────────────────────────────────────────

/**
 * ファイル生成・ディレクトリ解決・エラー終了の I/O 検証。
 * --dir / --agent --year-month によるパス解決と出力ファイル生成を確認する。
 */
describe('main - I/O', () => {
  // ─── T-15-01-01: --dir によるファイル生成 ───────────────────────────────────

  /** 正常系: --dir で指定したディレクトリの MD ファイルを処理してセグメント出力ファイルを生成する */
  describe('Given: マルチトピック MD ファイルが存在するディレクトリを --dir で指定する', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      // 2 MD files with frontmatter
      await Deno.writeTextFile(
        `${inputDir}/chat-a.md`,
        '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi',
      );
      await Deno.writeTextFile(
        `${inputDir}/chat-b.md`,
        '---\nproject: test\n---\n### User\nFix CI\n\n### AI\nSure',
      );

      const segmentResponse = JSON.stringify([
        { title: 'Topic A', summary: 'Summary A', body: '### User\nHello' },
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

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-01-01 - 収集した全 MD ファイルを処理してセグメント出力ファイルを生成する', () => {
        it('T-15-01-01-01: outputDir 配下に 2 件以上のセグメント出力ファイルが生成される', async () => {
          await main(['--dir', inputDir, '--output', outputDir]);

          const files = await findFiles(outputDir);
          assertEquals(files.length >= 2, true);
        });
      });
    });
  });

  // ─── T-15-02-01: --agent --year-month によるパス解決 ────────────────────────

  /** 正常系: --agent/--year-month で temp/chatlog/<agent>/<year>/<year-month>/ を解決して処理する */
  describe('Given: --agent claude --year-month 2026-03 と対応パスが存在する', () => {
    const AGENT_DIR = 'temp/chatlog/claude/2026/2026-03';
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    before(async () => {
      await Deno.mkdir(AGENT_DIR, { recursive: true });
      await Deno.writeTextFile(
        `${AGENT_DIR}/sample.md`,
        '### User\nHello\n\n### AI\nHi',
      );
    });

    after(async () => {
      await Deno.remove('temp/chatlog/claude/2026', { recursive: true });
    });

    beforeEach(async () => {
      outputDir = await Deno.makeTempDir();

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
      await Deno.remove(outputDir, { recursive: true });
    });

    describe('When: main(["--agent","claude","--year-month","2026-03","--output",outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-02-01 - temp/chatlog/<agent>/<year>/<year-month>/ から入力を解決してファイルを処理する', () => {
        it('T-15-02-01-01: temp/chatlog/claude/2026/2026-03/ 内のファイルが処理されて出力が生成される', async () => {
          await main(['--agent', 'claude', '--year-month', '2026-03', '--output', outputDir]);

          assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);
        });
      });
    });
  });

  // ─── T-15-05: chatlog形式入力パスに応じた出力パス構造 ────────────────────────

  /** 正常系: chatlog形式の入力パス (temp/chatlog/<agent>/<yyyy>/<yyyy-mm>) に対して
   *  出力が normalized-logs/<agent>/<yyyy>/<yyyy-mm>/<project>/ 以下に生成される */
  describe('Given: chatlog形式ディレクトリ (temp/chatlog/claude/2026/2026-04) と project フロントマターを持つ MD ファイル', () => {
    const CHATLOG_INPUT_DIR = 'temp/chatlog/claude/2026/2026-04';
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    before(async () => {
      await Deno.mkdir(CHATLOG_INPUT_DIR, { recursive: true });
      await Deno.writeTextFile(
        `${CHATLOG_INPUT_DIR}/chat.md`,
        '---\nproject: my-app\n---\n### User\nHello\n\n### AI\nHi',
      );
    });

    after(async () => {
      await Deno.remove('temp/chatlog/claude/2026', { recursive: true });
    });

    beforeEach(async () => {
      outputBase = await Deno.makeTempDir();

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary', body: 'Body' },
      ]);
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(segmentResponse)),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      logSilencer.restore();
      await Deno.remove(outputBase, { recursive: true });
    });

    describe('When: main(["--dir", CHATLOG_INPUT_DIR, "--output", outputBase]) を呼び出す', () => {
      describe('Then: Task T-15-05-01 - 出力が <outputBase>/claude/2026/2026-04/my-app/ 以下に生成される', () => {
        it('T-15-05-01-01: 出力ファイルのパスが <outputBase>/claude/2026/2026-04/my-app/ を含む', async () => {
          const fixedHash: HashProvider = () => 'abc1234';
          await main(['--dir', CHATLOG_INPUT_DIR, '--output', outputBase], fixedHash);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          const expectedSubPath = `claude/2026/2026-04/my-app`;
          const allUnderExpected = files.every((f) => normalizePath(f).includes(expectedSubPath));
          assertEquals(allUnderExpected, true);
        });
      });
    });
  });

  // ─── T-15-06: 任意ディレクトリ入力時は <outputBase>/<project>/ 以下に出力 ───

  /** 正常系: 任意パスの入力ディレクトリに対して出力が <outputBase>/<project>/ 以下に生成される */
  describe('Given: 任意パスのディレクトリと project フロントマターを持つ MD ファイル', () => {
    let inputDir: string;
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir: outputBase } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '---\nproject: custom-project\n---\n### User\nHello\n\n### AI\nHi',
      );

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary', body: 'Body' },
      ]);
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(segmentResponse)),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputBase);
    });

    describe('When: main(["--dir", inputDir, "--output", outputBase]) を呼び出す', () => {
      describe('Then: Task T-15-06-01 - 出力が <outputBase>/custom-project/ 以下に生成される', () => {
        it('T-15-06-01-01: 出力ファイルのパスが <outputBase>/custom-project/ を含む', async () => {
          const fixedHash: HashProvider = () => 'def5678';
          await main(['--dir', inputDir, '--output', outputBase], fixedHash);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          const allUnderProject = files.every((f) => normalizePath(f).includes('custom-project'));
          assertEquals(allUnderProject, true);
        });
      });
    });
  });

  // ─── T-15-07: project なし（misc フォールバック）────────────────────────────

  /** エッジケース: project フィールドなしの場合、出力が <outputBase>/misc/ 以下に生成される */
  describe('Given: project フロントマターなしの MD ファイル', () => {
    let inputDir: string;
    let outputBase: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir: outputBase } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '### User\nHello\n\n### AI\nHi',
      );

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary', body: 'Body' },
      ]);
      commandHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(segmentResponse)),
      );
      logSilencer = silenceLog();
    });

    afterEach(async () => {
      commandHandle.restore();
      logSilencer.restore();
      await removeTempDirs(inputDir, outputBase);
    });

    describe('When: main(["--dir", inputDir, "--output", outputBase]) を呼び出す', () => {
      describe('Then: Task T-15-07-01 - project なし時は misc サブディレクトリに出力される', () => {
        it('T-15-07-01-01: 出力ファイルのパスが <outputBase>/misc/ を含む', async () => {
          await main(['--dir', inputDir, '--output', outputBase]);

          const files = await findFiles(outputBase);
          assertEquals(files.length >= 1, true);
          const allUnderMisc = files.every((f) => normalizePath(f).includes('/misc/'));
          assertEquals(allUnderMisc, true);
        });
      });
    });
  });

  // ─── T-15-04-04: 単一トピックから 1 件生成 ──────────────────────────────────

  /** エッジケース: 単一トピックのチャットログから出力ファイルが正確に 1 件生成される */
  describe('Given: 単一トピックのチャットログファイルを含むディレクトリ', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let logSilencer: LogSilencer;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/single-topic.md`,
        '### User\nHow do I fix CI?\n\n### AI\nUse deno test.',
      );

      // AI returns exactly 1 segment
      const segmentResponse = JSON.stringify([
        { title: 'Fix CI', summary: 'Fix CI pipeline', body: '### User\nHow do I fix CI?' },
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

    describe('When: main(["--dir", inputDir, "--output", outputDir]) を呼び出す', () => {
      describe('Then: Task T-15-04-04 - 単一トピックの MD ファイルから出力ファイルが正確に 1 件生成される', () => {
        it('T-15-04-04-01: outputDir 配下に正確に 1 件の .md ファイルが生成される', async () => {
          await main(['--dir', inputDir, '--output', outputDir]);

          const files = await findFiles(outputDir);
          assertEquals(files.length, 1);
        });
      });
    });
  });
});
