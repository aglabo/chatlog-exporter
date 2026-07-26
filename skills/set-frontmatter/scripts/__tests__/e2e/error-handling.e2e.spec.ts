// src: scripts/__tests__/e2e/error-handling.e2e.spec.ts
// @(#): main() のエラーハンドリング E2E テスト
//       yaml 生成失敗（fail=1）・rate limit 貫通で ChatlogError reject を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../set-frontmatter.ts';
// error class
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';

// ─── Helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { _enc, _makeDicsDir, _makeRateLimitMock, _makeTargetDir } from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

// ─── T-SF-E2E-05: yaml 生成失敗 → stats.fail が出力される ───────────────────

describe('main - yaml 生成失敗', () => {
  describe('Given: Claude CLI がすべて成功するが yaml が空になるモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-05 - fail=1 のサマリーが出力される', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          // 全フェーズで空文字を返す（title: なし → cleanYaml で空になる）
          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('')),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-05-01: "fail=1" がサマリーに出力される', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir, '--no-review', '--dics', dicsDir]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('fail=1')), true);
        });
      });
    });
  });
});

// ─── T-SF-E2E-13: rate limit が全リンクを貫通して main を reject する ──────────

/**
 * Phase 2.1 の最初の `runAI` が rate limit 応答を返したとき、rate limit エラーが
 * runAI → judgeTypeAndCategory(再throw) → withConcurrency abort → _wrapParallelError 透過 → main
 * と全リンクを貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject することを検証する。
 *
 * `--dry-run` を付けると Phase 2.1 の runAI がスキップされ再現しないため、必ず除外する。
 *
 * テスト ID 範囲: T-SF-E2E-13-01
 */
describe('main - rate limit 貫通 (T-SF-E2E-13)', () => {
  describe('Given: Phase 2.1 の runAI が rate limit 応答を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-13 - main が ChatlogError(AiError/RateLimit) で reject する', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await _makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();
          commandHandle = installCommandMock(_makeRateLimitMock());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          // dicsDir は baseDir/dics なので親ディレクトリを削除
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Error] T-SF-E2E-13-01: rate limit が貫通し ChatlogError(kind=AiError, subindex=RateLimit) で reject する', async () => {
          const _err = await assertRejects(
            () =>
              main([
                '--input-dir',
                inputDir,
                '--output-dir',
                outputDir,
                '--no-review',
                '--dics',
                dicsDir,
              ]),
            ChatlogError,
          ) as ChatlogError;
          assertEquals(_err.kind, 'AiError');
          assertEquals(_err.subindex, 'RateLimit');
        });
      });
    });
  });
});
