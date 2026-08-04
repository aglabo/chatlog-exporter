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
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';

// ─── Helpers
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import {
  makeDicsDir,
  makeRateLimitFailOnNthMock,
  makeRateLimitMock,
  makeSuccessThenExitFailMock,
  makeSuccessThenRateLimitFailMock,
  makeTargetDir,
} from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';

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
            makeClaudeJsonMock(''),
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

// ─── T-SF-E2E-16: rate limit が Phase 2.1 で main を reject（バグの発生箇所） ─

/**
 * バグ再現テスト。Phase 2.1（type/category）の最初の runAI が exit 1 + rate limit
 * （`_RATE_LIMIT_PATTERN` にヒットし RateLimit 判定）で落ちたとき、以前はデフォルト type/category を黙って書き込んでいた。
 * 修正後は `RateLimit` が judgeTypeAndCategory(即throw) → phaseTypeAndCategory(try/catchなし・素通し)
 * → withConcurrency abort → main と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject する。
 *
 * テスト ID 範囲: T-SF-E2E-16-01
 */
describe('main - rate limit 貫通 (Phase 2.1 / バグ発生箇所) (T-SF-E2E-16)', () => {
  describe('Given: Phase2.1 最初の runAI が rate limit を返すモック', () => {
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
          // 1回目(type/category)のみ rate limit。以降(frontmatter)は success。
          // Phase 2.1 が握りつぶすと後続が成功し main は resolve するため、Phase 2.1 の
          // abort ゲート単体を分離検証できる（gate 未修正なら resolve = RED）。
          commandHandle = installCommandMock(
            makeRateLimitFailOnNthMock(
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

        it('[Error] T-SF-E2E-16-01: Phase 2.1 の rate limit が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
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

// ─── T-SF-E2E-14: rate limit が frontmatter フェーズを貫通して main を reject ─

/**
 * Phase 2.1（type/category）は成功し、Phase 2.2（frontmatter 生成）の runAI が
 * exit 1 + rate limit（`_RATE_LIMIT_PATTERN` にヒットし RateLimit 判定）で落ちたとき、`RateLimit` が
 * generateFrontmatter(即throw) → phaseFrontmatter の abort ゲート → withConcurrency abort → main
 * と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject することを検証する。
 *
 * テスト ID 範囲: T-SF-E2E-14-01
 */
describe('main - rate limit 貫通 (frontmatter フェーズ) (T-SF-E2E-14)', () => {
  describe('Given: Phase2.1 成功・Phase2.2 で rate limit を返すモック', () => {
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
          // 1回目(type/category)成功、2回目以降(frontmatter)を rate limit にする
          commandHandle = installCommandMock(
            makeSuccessThenRateLimitFailMock(1, 'type: research\ncategory: development'),
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

        it('[Error] T-SF-E2E-14-01: frontmatter フェーズの rate limit が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
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

// ─── T-SF-E2E-15: rate limit が review フェーズを貫通して main を reject ─

/**
 * Phase 2.1（type/category）と Phase 2.2（frontmatter）は成功し、Phase 3.1（review）の
 * runAI が exit 1 + rate limit（`_RATE_LIMIT_PATTERN` にヒットし RateLimit 判定）で落ちたとき、`RateLimit` が
 * reviewFrontmatter(即throw) → phaseReview の abort ゲート → withConcurrency abort → main
 * と貫通し、`main()` が `ChatlogError(AiError/RateLimit)` で reject することを検証する。
 *
 * review フェーズを実行するため `--no-review` は付けない。
 *
 * テスト ID 範囲: T-SF-E2E-15-01
 */
describe('main - rate limit 貫通 (review フェーズ) (T-SF-E2E-15)', () => {
  describe('Given: Phase2.1/2.2 成功・Phase3.1(review) で rate limit を返すモック', () => {
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
          // 1回目(type/category)+2回目(frontmatter)成功、3回目以降(review)を rate limit にする。
          // frontmatter フェーズが必須フィールドを生成できるよう title/topics/tags を返す。
          commandHandle = installCommandMock(
            makeSuccessThenRateLimitFailMock(
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

        it('[Error] T-SF-E2E-15-01: review フェーズの rate limit が貫通し ChatlogError(AiError/RateLimit) で reject する', async () => {
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

// ─── T-SF-E2E-17: ExitFailure(非RateLimit) が Phase 2.1 で main を reject させず続行 ─

/**
 * Phase 2.1（type/category）の最初の runAI が非 RateLimit の AI エラー（claude JSON
 * `is_error:true` / `api_error_status:500` → ExitFailure）で落ちたとき、`main()` が reject せず
 * `logger.error` を出して続行することを検証する。
 *
 * ExitFailure は RateLimit と区別され、中断せず skip（type/category を書かない）される。
 *
 * テスト ID 範囲: T-SF-E2E-17-01
 */
describe('main - ExitFailure 続行 (Phase 2.1 type/category) (T-SF-E2E-17)', () => {
  describe('Given: Phase2.1 最初の runAI が ExitFailure(is_error:true/status:500) を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-17 - main が reject せず resolve し error ログを出す', () => {
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
          // okCount=0: 最初の呼び出し(type/category)から ExitFailure
          commandHandle = installCommandMock(makeSuccessThenExitFailMock(0, 'type: research\ncategory: development'));
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

        it('[Error] T-SF-E2E-17-01: Phase 2.1 の ExitFailure で main が resolve し errorLogs に判定失敗ログが出る', async () => {
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

          assertEquals(loggerStub.errorLogs.some((l) => l.includes('type/category 判定失敗')), true);
        });
      });
    });
  });
});

// ─── T-SF-E2E-18: ExitFailure(非RateLimit) が frontmatter フェーズで main を reject させず続行 ─

/**
 * Phase 2.1（type/category）は成功し、Phase 2.2（frontmatter 生成）の runAI が非 RateLimit の
 * AI エラー（ExitFailure）で落ちたとき、`main()` が reject せず `logger.error`（生成失敗）を出して
 * 続行することを検証する。
 *
 * テスト ID 範囲: T-SF-E2E-18-01
 */
describe('main - ExitFailure 続行 (frontmatter フェーズ) (T-SF-E2E-18)', () => {
  describe('Given: Phase2.1 成功・Phase2.2 で ExitFailure を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--no-review", "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-18 - main が reject せず resolve し error ログ(生成失敗)を出す', () => {
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
          // okCount=1: 1回目(type/category)成功、2回目以降(frontmatter)を ExitFailure にする
          commandHandle = installCommandMock(makeSuccessThenExitFailMock(1, 'type: research\ncategory: development'));
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

        it('[Error] T-SF-E2E-18-01: frontmatter フェーズの ExitFailure で main が resolve し errorLogs に生成失敗ログが出る', async () => {
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

          assertEquals(loggerStub.errorLogs.some((l) => l.includes('生成失敗')), true);
        });
      });
    });
  });
});

// ─── T-SF-E2E-19: ExitFailure(非RateLimit) が review フェーズで main を reject させず続行 ─

/**
 * Phase 2.1（type/category）と Phase 2.2（frontmatter）は成功し、Phase 3.1（review）の runAI が
 * 非 RateLimit の AI エラー（ExitFailure）で落ちたとき、`main()` が reject せず
 * `logger.error`（review 失敗）を出して続行することを検証する。
 *
 * review フェーズを実行するため `--no-review` は付けない。frontmatter が必須フィールドを生成できるよう
 * title/topics/tags を含む rich stdout を返す。
 *
 * テスト ID 範囲: T-SF-E2E-19-01
 */
describe('main - ExitFailure 続行 (review フェーズ) (T-SF-E2E-19)', () => {
  describe('Given: Phase2.1/2.2 成功・Phase3.1(review) で ExitFailure を返すモック', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--dics", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-19 - main が reject せず resolve し error ログ(review 失敗)を出す', () => {
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
          // okCount=2: 1回目(type/category)+2回目(frontmatter)成功、3回目以降(review)を ExitFailure にする
          commandHandle = installCommandMock(
            makeSuccessThenExitFailMock(
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

        it('[Error] T-SF-E2E-19-01: review フェーズの ExitFailure で main が resolve し errorLogs に review 失敗ログが出る', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.errorLogs.some((l) => l.includes('review 失敗')), true);
        });
      });
    });
  });
});
