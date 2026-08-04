// src: scripts/__tests__/e2e/review.e2e.spec.ts
// @(#): main() の --no-review E2E テスト
//       --no-review の Phase 3.5 スキップログを確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../set-frontmatter.ts';

// ─── Helpers
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { makeDicsDir, makeTargetDir } from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';

// ─── Tests

// ─── T-SF-E2E-02: --no-review → Phase 3.5 スキップ ───────────────────────────

describe('main - --no-review モード', () => {
  describe('Given: 1件の .md ファイルと --no-review フラグ', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-02 - Phase 3.5 スキップのログが出力される', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(
            makeClaudeJsonMock('research'),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-02-01: "--no-review" または "スキップ" がログに含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(
            loggerStub.infoLogs.some((l) =>
              l.includes('no-review') || l.includes('スキップ') || l.includes('Phase 3.5')
            ),
            true,
          );
        });
      });
    });
  });
});
