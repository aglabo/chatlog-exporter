#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
// src: scripts/__tests__/e2e/normalize-chatlogs-full.e2e.spec.ts
// @(#): normalize-chatlogs の統合 E2E テスト
//       IO / aggregation / structure / reproducibility を一括検証する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// Deno Test module
import { assertEquals, assertMatch } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── helpers ──────────────────────────────────────────────────────────────────

import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeTempDirs, removeTempDirs } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { assertAllOutputFiles } from '../../../../_scripts/__tests__/helpers/output-validator.ts';

// test target
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { findFiles } from '../../../../_scripts/libs/file-ops/find-files.ts';
import { main } from '../../normalize-chatlogs.ts';
import type { HashProvider } from '../../normalize-chatlogs.ts';

// ─── full E2E ─────────────────────────────────────────────────────────────────

/**
 * IO / aggregation / structure / reproducibility を一括で検証する統合 E2E テスト。
 * 実際の使用シナリオに近い状況で normalize-chatlogs のエンドツーエンド動作を確認する。
 */
describe('normalize-chatlogs - full E2E', () => {
  // ─── IO: ファイル生成とカウント ────────────────────────────────────────────────

  describe('IO: 複数 MD ファイルから出力ファイルが生成される', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/chat-a.md`,
        '---\nproject: my-project\n---\n### User\nHow does CI work?\n\n### AI\nCI runs tests automatically.',
      );
      await Deno.writeTextFile(
        `${inputDir}/chat-b.md`,
        '---\nproject: my-project\n---\n### User\nHow do I deploy?\n\n### AI\nRun the deploy script.',
      );
      await Deno.writeTextFile(
        `${inputDir}/chat-c.md`,
        '---\nproject: my-project\n---\n### User\nWhat is linting?\n\n### AI\nLinting checks code style.',
      );

      const segmentResponse = JSON.stringify([
        { title: 'Topic', summary: 'Summary of topic', body: '### User\nQuestion' },
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

    it('T-FULL-01: 3 件の入力から 3 件以上の出力ファイルが生成され success=3 がレポートされる', async () => {
      await main(['--dir', inputDir, '--output', outputDir]);

      // IO: 出力ファイルが生成されている
      const files = await findFiles(outputDir);
      assertEquals(files.length >= 3, true);

      // aggregation: 全件 success に集計されている
      assertMatch(loggerStub.infoLogs.join('\n'), /success=3/);
    });
  });

  // ─── structure: 出力ファイルの内部構造 ───────────────────────────────────────

  describe('structure: 出力ファイルが正しい構造を持つ', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(
        `${inputDir}/chat.md`,
        '---\nproject: structured-project\n---\n### User\nExplain TDD.\n\n### AI\nTDD means writing tests first.',
      );

      const segmentResponse = JSON.stringify([
        { title: 'TDD Explanation', summary: 'Overview of TDD', body: '### User\nExplain TDD.' },
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

    it('T-FULL-02: 出力ファイルが YAML frontmatter・## Summary・project フィールドを含む', async () => {
      await main(['--dir', inputDir, '--output', outputDir]);

      const files = await findFiles(outputDir);
      assertEquals(files.length >= 1, true);

      // structure: frontmatter / Summary / project フィールドの検証
      await assertAllOutputFiles(files, {
        expectFrontmatterField: { key: 'project', value: 'structured-project' },
      });
    });
  });

  // ─── reproducibility: 再実行時のバックアップと入力不変 ────────────────────────

  describe('reproducibility: 再実行時に既存出力をバックアップし入力を変更しない', () => {
    let inputDir: string;
    let outputDir: string;
    let commandHandle: CommandMockHandle;
    let loggerStub: LoggerStub;
    const inputContent = '---\nproject: repro-project\n---\n### User\nTest reproducibility.\n\n### AI\nOK.';

    beforeEach(async () => {
      ({ inputDir, outputDir } = await makeTempDirs());

      await Deno.writeTextFile(`${inputDir}/chat.md`, inputContent);

      const segmentResponse = JSON.stringify([
        { title: 'Reproducibility', summary: 'Test run', body: '### User\nTest.' },
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

    it('T-FULL-03: 2 回実行後に旧ファイルが .old-01.md にバックアップされ、入力ファイルは不変である', async () => {
      const fixedHash: HashProvider = () => '0000000';

      // 1 回目: 出力ファイルを生成
      await main(['--dir', inputDir, '--output', outputDir], fixedHash);

      // 2 回目: バックアップを生成
      loggerStub.infoLogs.splice(0);
      await main(['--dir', inputDir, '--output', outputDir], fixedHash);

      // reproducibility: 2 回目も success=1
      assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);

      // reproducibility: .old-01.md バックアップが存在する（サブディレクトリも含めて再帰検索）
      const allFiles = await findFiles(outputDir);
      const backupExists = allFiles.some((path) => path.includes('.old-01.md'));
      assertEquals(backupExists, true);

      // reproducibility: 入力ファイルは不変
      const afterContent = await readTextFile(`${inputDir}/chat.md`);
      assertEquals(afterContent, inputContent);
    });
  });
});
