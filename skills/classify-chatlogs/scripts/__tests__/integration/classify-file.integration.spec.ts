// src: scripts/__tests__/integration/classify-chatlogs.classify-file.integration.spec.ts
// @(#): classifyFile の統合テスト（正常移動・移動失敗 分岐）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
// -- BDD modules --
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// -- Test target --
import { classifyFile } from '../../classify-chatlogs.ts';
// stub
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// types for stubs
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// classes
import { ClassifyChatlogEntry } from '../../classes/ClassifyChatlogEntry.class.ts';
// types
import type { ClassifyStats } from '../../types/classify.types.ts';
// exists
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import { dirExists, fileExists, fileOrDirExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function _makeStats(): ClassifyStats {
  return { moved: 0, skipped: 0, error: 0 };
}

// ─── classifyFile ─────────────────────────────────────────────────────────────

describe('classifyFile', () => {
  let tempDir: string;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir();
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    await Deno.remove(tempDir, { recursive: true });
  });

  // ─── T-CL-CF-02: 正常移動 ────────────────────────────────────────────────

  describe('Given: 実在するファイルと dryRun=false', () => {
    describe('When: classifyFile(fileMeta, "app1", false, stats) を呼び出す', () => {
      describe('Then: T-CL-CF-02 - ファイルが app1/ サブディレクトリへ移動される', () => {
        it('T-CL-CF-02-04: stats.moved が 1 になる', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-CF-02-06: dstDir（tempDir/app1）が存在する', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(await dirExists(`${tempDir}/app1`), true);
        });

        it('T-CL-CF-02-01: dstPath にファイルが存在する', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(await fileExists(`${tempDir}/app1/a.md`), true);
        });

        it('T-CL-CF-02-02: srcPath が存在しない', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(await fileOrDirExists(srcPath), false, 'srcPath がまだ存在する');
        });

        it('T-CL-CF-02-03: dstPath のテキストに "project: app1" が含まれる', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          const _dstText = await readTextFile(`${tempDir}/app1/a.md`);
          assertStringIncludes(_dstText, 'project: "app1"');
        });

        it('T-CL-CF-02-05: infoLogs に "moved:" が含まれる', async () => {
          const fileContent = `---\ntitle: Test Title\ncategory: development\n---\n本文`;
          const srcPath = `${tempDir}/a.md`;
          await Deno.writeTextFile(srcPath, fileContent);
          const fileMeta = new ClassifyChatlogEntry(fileContent, srcPath);
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          const _allInfo = loggerStub.infoLogs.join('\n');
          assertStringIncludes(_allInfo, 'moved:');
        });
      });
    });
  });

  // ─── T-CL-CF-03: 移動失敗 ────────────────────────────────────────────────

  describe('Given: 存在しないファイルパスと dryRun=false', () => {
    describe('When: classifyFile(fileMeta, "app1", false, stats) を呼び出す（srcPath 不在）', () => {
      describe('Then: T-CL-CF-03 - 例外なしで stats.error+1 になる', () => {
        it('T-CL-CF-03-01: 例外がスローされない', async () => {
          const fileMeta = new ClassifyChatlogEntry(
            `---\ntitle: Test\n---\n本文`,
            `${tempDir}/missing.md`,
          );
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);
        });

        it('T-CL-CF-03-02: stats.error が 1 になる', async () => {
          const fileMeta = new ClassifyChatlogEntry(
            `---\ntitle: Test\n---\n本文`,
            `${tempDir}/missing.md`,
          );
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(stats.error, 1);
        });

        it('T-CL-CF-03-03: errorLogs に "移動失敗:" が含まれる', async () => {
          const fileMeta = new ClassifyChatlogEntry(
            `---\ntitle: Test\n---\n本文`,
            `${tempDir}/missing.md`,
          );
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          const _allError = loggerStub.errorLogs.join('\n');
          assertStringIncludes(_allError, '移動失敗:');
        });

        it('T-CL-CF-03-04: stats.moved が 0 のまま', async () => {
          const fileMeta = new ClassifyChatlogEntry(
            `---\ntitle: Test\n---\n本文`,
            `${tempDir}/missing.md`,
          );
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', false, stats);

          assertEquals(stats.moved, 0);
        });
      });
    });
  });
});
