// src: scripts/__tests__/e2e/dry-run.e2e.spec.ts
// @(#): main() の dry-run E2E テスト
//       dry-run のファイル無変更・完了ログ集計・[dry-run]ループ対象・FAIL抑制を確認する
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
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { readTextFile } from '../../../../_scripts/libs/file-io/read-utils.ts';
import {
  enc,
  makeCacheDir,
  makeDicsDir,
  makeTargetDir,
  makeTwoFileDir,
} from '../helpers/setfm-e2e-helpers.ts';
// constants
import { SETFM_CACHE_STATUSES } from '../../types/cache.const.type.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

// ─── T-SF-E2E-01: dry-run → ファイル変更なし ─────────────────────────────────

describe('main - dry-run モード', () => {
  describe('Given: 1件の .md ファイルと dry-run フラグ', () => {
    describe('When: main(["--input-dir", dir, "--output-dir", outDir, "--dry-run", ...]) を呼び出す', () => {
      describe('Then: T-SF-E2E-01 - ファイルが変更されない', () => {
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

          // 各フェーズの応答を順番に返す（全呼び出しで成功）
          const callIdx = 0;
          const phaseResponses = [
            'research',
            'development',
            'title: テスト',
            'validity: pass',
          ];
          commandHandle = installCommandMock(
            makeSuccessMock(enc.encode(phaseResponses.join('\n')), { value: [] }),
          );
          void callIdx;

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

        it('T-SF-E2E-01-01: ファイルの内容が変更されない', async () => {
          const originalContent = await readTextFile(`${inputDir}/test.md`);

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

          const updatedContent = await readTextFile(`${inputDir}/test.md`);
          assertEquals(updatedContent, originalContent);
        });

        it('T-SF-E2E-01-02: dryrun ログが出力される', async () => {
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

          assertEquals(loggerStub.dryrunLogs.length > 0, true);
        });

        it('T-SF-E2E-01-03: dry-run 時は type/category エントリの dryrun ログが出力される', async () => {
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

          assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('type/category')), true);
        });
      });
    });
  });

  // ─── T-SF-E2E-01-04: status=written ファイルは dry-run 後も変わらない ────────
  describe('Given: status=written のファイルと dry-run フラグ', () => {
    describe('When: main([--input-dir, --output-dir, --cache-dir, --dry-run, --no-review, --dics]) を呼び出す', () => {
      describe('Then: T-SF-E2E-01-04 - status=written ファイルの内容が変わらない', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir('---\ntitle: Test\n---\n# body\n');
          outputDir = await Deno.makeTempDir();
          cacheDir = await makeCacheDir(['test']);
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('[Normal] T-SF-E2E-01-04: status=written のファイルは --dry-run 実行後も内容が変わらない', async () => {
          const originalContent = await readTextFile(`${inputDir}/test.md`);

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

          const updatedContent = await readTextFile(`${inputDir}/test.md`);
          assertEquals(updatedContent, originalContent);
        });
      });
    });
  });
});

// ─── T-SF-DR: dry-run 完了ログと dry-run ループ対象 ──────────────────────────

describe('main - dry-run 完了ログ (T-SF-DR)', () => {
  /**
   * `dry-run` 時の完了ログと `[dry-run]` ループ対象の検証。
   *
   * Fix 1: dry-run ループを `targetEntries` に限定。
   * Fix 2: 完了ログに `written=N target=N` を追加。
   *
   * テスト ID 範囲: T-SF-DR-01 〜 T-SF-DR-05
   */

  // ─── T-SF-DR-01: written=1/target=1 混在 ─────────────────────────────────
  describe('Given: 2件の .md と cache に 1件 written', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-01 - 完了ログに written=1 target=1 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTwoFileDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await makeCacheDir(['written']);
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('T-SF-DR-01-01: 完了ログに "written=1 target=1" が含まれる', async () => {
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

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=1 target=1')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-02: すべて written → target=0 ──────────────────────────────
  describe('Given: 1件の .md と cache に 1件 written（全件 written）', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-02 - 完了ログに written=1 target=0 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await makeCacheDir(['test']);
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('T-SF-DR-02-01: 完了ログに "written=1 target=0" が含まれる', async () => {
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

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=1 target=0')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-03: すべて target → written=0 ──────────────────────────────
  describe('Given: 1件の .md と cache エントリなし（全件 target）', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-03 - 完了ログに written=0 target=1 が含まれる', () => {
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
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('T-SF-DR-03-01: 完了ログに "written=0 target=1" が含まれる', async () => {
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

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('written=0 target=1')), true);
        });
      });
    });
  });

  // ─── T-SF-DR-04: [dry-run] ログが targetEntries のみを含む ───────────────
  describe('Given: 2件の .md と cache に 1件 written', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-04 - [dry-run] ログが target ファイル名を含み written を含まない', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTwoFileDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await makeCacheDir(['written']);
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('T-SF-DR-04-01: dryrun ログに target.md のファイル名が含まれる', async () => {
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

          assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('target.md')), true);
        });

        it('T-SF-DR-04-02: dryrun ログに written.md のファイル名が含まれない', async () => {
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

          assertEquals(loggerStub.dryrunLogs.every((l) => !l.includes('written.md')), true);
        });

        it('T-SF-DR-04-03: ステータス別進捗の infoLogs に "[written] written.md" が含まれる', async () => {
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
            loggerStub.infoLogs.some((l) => l.includes('[written]') && l.includes('written.md')),
            true,
          );
        });
      });
    });
  });

  // ─── T-SF-DR-05: すべて written → [dry-run] ログなし ────────────────────
  describe('Given: 1件の .md と全件 written のキャッシュ', () => {
    describe('When: main([--dry-run, --cache-dir, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-05 - [dry-run] ログが0件', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await makeCacheDir(['test']);
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('T-SF-DR-05-01: dryrun ログが0件', async () => {
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

          assertEquals(loggerStub.dryrunLogs.length, 0);
        });
      });
    });
  });
});

// ─── T-SF-DR-06: dry-run ステータス別集計 ────────────────────────────────────

describe('main - dry-run ステータス別集計 (T-SF-DR-06)', () => {
  /**
   * `--dry-run` 時、全エントリを到達 status ごとに集計した `dry-run 集計:` ログを検証する。
   *
   * 集計対象は writtenEntries / reviewedEntries / generateEntries の全スナップショット。
   * `dry-run` フラグなしのときは集計ログを出力しない。
   *
   * テスト ID 範囲: T-SF-DR-06-01 〜 T-SF-DR-06-03
   */
  describe('Given: cache エントリなしの .md 1件（全 target = AI 判定対象）', () => {
    describe('When: main([--dry-run, --no-review, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-06-01 - ステータス別集計ログに total=1 が含まれる', () => {
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
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('[Normal] T-SF-DR-06-01: infoLogs に "dry-run 集計:" と "(total=1)" が含まれる', async () => {
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
            loggerStub.infoLogs.some((l) => l.includes('dry-run 集計:') && l.includes('(total=1)')),
            true,
          );
        });
      });
    });
  });

  describe('Given: cache に 1件 frontmatter+frontmatter（cached）+ 1件 cache miss（skip）', () => {
    describe('When: main([--dry-run, --cache-dir, --no-review, ...]) を呼び出す', () => {
      describe('Then: T-SF-DR-06-03 - ステータス別集計ログに total=2 が含まれる', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTwoFileDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          // target.md を「生成済み（frontmatter + 全5フィールド frontmatter）」で登録 → cached。
          // written.md は cache 未登録 → cache miss → skip。
          const fmCacheDir = `${cacheDir}/fm-cache`;
          await Deno.mkdir(fmCacheDir, { recursive: true });
          await Deno.writeTextFile(
            `${fmCacheDir}/target.json`,
            JSON.stringify({
              status: SETFM_CACHE_STATUSES.FRONTMATTER,
              type: 'tech',
              category: 'backend',
              frontmatter: { type: 'tech', category: 'backend', title: 't', topics: ['a'], tags: ['b'] },
            }),
          );
          dicsDir = await makeDicsDir();
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('[Normal] T-SF-DR-06-03: infoLogs に "dry-run 集計:" と "(total=2)" が含まれる', async () => {
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
            loggerStub.infoLogs.some((l) => l.includes('dry-run 集計:') && l.includes('(total=2)')),
            true,
          );
        });
      });
    });
  });

  describe('Given: dry-run フラグなし（通常実行）', () => {
    describe('When: main([--no-review, ...]) を dry-run なしで呼び出す', () => {
      describe('Then: T-SF-DR-06-02 - 集計ログを出力しない', () => {
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
          commandHandle = installCommandMock(makeSuccessMock(enc.encode('research')));
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

        it('[Normal] T-SF-DR-06-02: infoLogs に "dry-run 集計:" が含まれない', async () => {
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

          assertEquals(
            loggerStub.infoLogs.every((l) => !l.includes('dry-run 集計:')),
            true,
          );
        });
      });
    });
  });
});

// ─── T-SF-E2E-DR-05: dry-run → FAIL(yaml空) が出ない ────────────────────────

describe('main - dry-run FAIL抑制 (T-SF-E2E-DR-05)', () => {
  /**
   * `--dry-run` 実行時は Phase 4 の FAIL 判定をスキップし、
   * `FAIL (yaml空)` のエラーログが出力されないことを検証する。
   *
   * テスト ID 範囲: T-SF-E2E-DR-05-01 〜 T-SF-E2E-DR-05-02
   */
  describe('Given: Claude CLI が空レスポンスを返し --dry-run フラグがある', () => {
    describe('When: main([--input-dir, --output-dir, --dry-run, --no-review, --dics]) を呼び出す', () => {
      describe('Then: T-SF-E2E-DR-05 - FAIL(yaml空) ログが出ない', () => {
        let inputDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await makeTargetDir();
          outputDir = await Deno.makeTempDir();
          dicsDir = await makeDicsDir();
          // 全フェーズで空文字を返す（status が空になる条件）
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
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Normal] T-SF-E2E-DR-05-01: errorLogs に "FAIL (yaml空)" が含まれない', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.errorLogs.every((l) => !l.includes('FAIL (yaml空)')), true);
        });

        it('[Normal] T-SF-E2E-DR-05-02: infoLogs に "fail=0" が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('fail=0')), true);
        });
      });
    });
  });
});
