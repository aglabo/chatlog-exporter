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
import {
  enc,
  makeBannerFailOnNthMock,
  makeDicsDir,
  makeRateLimitMock,
  makeSuccessThenBannerFailMock,
  makeTargetDir,
} from '../helpers/setfm-e2e-helpers.ts';
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
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          dicsDir = await makeDicsDir();
          // 全フェーズで空文字を返す（title: なし → cleanYaml で空になる）
          commandHandle = installCommandMock(
            makeSuccessMock(enc.encode('')),
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

        it('T-SF-E2E-05-01: "fail=1" がサマリーに出力される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

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
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeRateLimitMock());
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

// ─── T-SF-E2E-16: rate limit(sandbox バナー) が Phase 2.1 で main を reject（バグの発生箇所） ─

/**
 * バグ再現テスト。Phase 2.1（type/category）の最初の runAI が exit 1 + sandbox バナー
 * （バナー本文が `_SANDBOX_DISABLED_PATTERN` にヒットし RateLimit 判定）で落ちたとき、以前はデフォルト type/category を黙って書き込んでいた。
 * 修正後は `RateLimit` が judgeTypeAndCategory(即throw) → phaseTypeAndCategory(try/catchなし・素通し)
 * → withConcurrency abort → main と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject する。
 *
 * テスト ID 範囲: T-SF-E2E-16-01
 */
describe('main - rate limit(sandbox バナー) 貫通 (Phase 2.1 / バグ発生箇所) (T-SF-E2E-16)', () => {
  describe('Given: Phase2.1 最初の runAI が sandbox バナー rate limit を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--cache-dir", ..., "--no-review", "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-16 - main が ChatlogError(AiError/RateLimit) で reject する', () => {
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
          // 1回目(type/category)のみ banner rate limit。以降(frontmatter)は success。
          // Phase 2.1 が握りつぶすと後続が成功し main は resolve するため、Phase 2.1 の
          // abort ゲート単体を分離検証できる（gate 未修正なら resolve = RED）。
          commandHandle = installCommandMock(
            makeBannerFailOnNthMock(
              1,
              'type: research\ncategory: development\ntitle: "t"\ntopics:\n  - ai\ntags:\n  - test\n',
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Error] T-SF-E2E-16-01: Phase 2.1 の rate limit(sandbox バナー) が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
          const _err = await assertRejects(
            () =>
              main([
                '--input-dir',
                inputDir,
                '--output-dir',
                outputDir,
                '--cache-dir',
                cacheDir,
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

// ─── T-SF-E2E-14: rate limit(sandbox バナー) が frontmatter フェーズを貫通して main を reject ─

/**
 * Phase 2.1（type/category）は成功し、Phase 2.2（frontmatter 生成）の runAI が
 * exit 1 + sandbox バナー（バナー本文が `_SANDBOX_DISABLED_PATTERN` にヒットし RateLimit 判定）で落ちたとき、`RateLimit` が
 * generateFrontmatter(即throw) → phaseFrontmatter の abort ゲート → withConcurrency abort → main
 * と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject することを検証する。
 *
 * テスト ID 範囲: T-SF-E2E-14-01
 */
describe('main - rate limit(sandbox バナー) 貫通 (frontmatter フェーズ) (T-SF-E2E-14)', () => {
  describe('Given: Phase2.1 成功・Phase2.2 で sandbox バナー rate limit を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-14 - main が ChatlogError(AiError/RateLimit) で reject する', () => {
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
          // 1回目(type/category)成功、2回目以降(frontmatter)を banner rate limit にする
          commandHandle = installCommandMock(
            makeSuccessThenBannerFailMock(1, 'type: research\ncategory: development'),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Error] T-SF-E2E-14-01: frontmatter フェーズの rate limit(sandbox バナー) が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
          const _err = await assertRejects(
            () =>
              main([
                '--input-dir',
                inputDir,
                '--output-dir',
                outputDir,
                '--cache-dir',
                cacheDir,
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

// ─── T-SF-E2E-15: rate limit(sandbox バナー) が review フェーズを貫通して main を reject ─

/**
 * Phase 2.1（type/category）と Phase 2.2（frontmatter）は成功し、Phase 3.1（review）の
 * runAI が exit 1 + sandbox バナー（バナー本文が `_SANDBOX_DISABLED_PATTERN` にヒットし RateLimit 判定）で落ちたとき、`RateLimit` が
 * reviewFrontmatter(即throw) → phaseReview の abort ゲート → withConcurrency abort → main
 * と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject することを検証する。
 *
 * review フェーズを実行するため `--no-review` は付けない。
 *
 * テスト ID 範囲: T-SF-E2E-15-01
 */
describe('main - rate limit(sandbox バナー) 貫通 (review フェーズ) (T-SF-E2E-15)', () => {
  describe('Given: Phase2.1/2.2 成功・Phase3.1(review) で sandbox バナー rate limit を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-15 - main が ChatlogError(AiError/RateLimit) で reject する', () => {
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
          // 1回目(type/category)+2回目(frontmatter)成功、3回目以降(review)を banner rate limit にする。
          // frontmatter フェーズが必須フィールドを生成できるよう title/topics/tags を返す。
          commandHandle = installCommandMock(
            makeSuccessThenBannerFailMock(
              2,
              'type: research\ncategory: development\ntitle: "t"\ntopics:\n  - ai\ntags:\n  - test\n',
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Error] T-SF-E2E-15-01: review フェーズの rate limit(sandbox バナー) が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
          const _err = await assertRejects(
            () =>
              main([
                '--input-dir',
                inputDir,
                '--output-dir',
                outputDir,
                '--cache-dir',
                cacheDir,
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
