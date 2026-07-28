// src: scripts/__tests__/e2e/main.e2e.spec.ts
// @(#): filter-chatlogs main() の E2E テスト
//       main() 経由でのフィルタリングフロー（Deno.Command モック・実 tempdir）
//
//       filter-chatlogs の動作:
//         入力: inputDir/agent/YYYY/YYYY-MM/*.md
//         DISCARD 判定かつ confidence >= 0.7 のファイルを削除する
//         (classify-chatlogs と異なり、移動ではなく削除)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../filter-chatlogs.ts';
// classes
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import { LOGGER_HEADER } from '../../../../_scripts/constants/logger-header.constants.ts';

// ─── Helpers
// mocks
import {
  installCommandMock,
  makeClaudeJsonMock,
  makeCountingMock,
  makeFailMock,
  makeNotFoundMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// stub
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../../../_scripts/constants/defaults.constants.ts';
import { FILTER_DECISIONS } from '../../types/filter-decision.const.types.ts';
import { FILTER_MIN_CONTENT_LENGTH } from '../_helpers/constants.ts';
// types
import type { CommandMockHandle, DenoCommandLike } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// e2e helpers
import { assertFileNotExist } from '../../../../_scripts/__tests__/helpers/assert.ts';
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { makeRepeatedContent, makeTestDirs } from '../_helpers/fixtures.ts';
// helpers
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';

// ─── Internal Helpers

// functions

/** `_makeTestDirs` のラッパー。デフォルト引数付きで `makeTestDirs` を呼び出す。 */
const _makeTestDirs = (agent = 'claude', period = '2026-03') => makeTestDirs(agent, period);

/** `_makeValidContent` のラッパー。`FILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = (title = 'テスト') => makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH, title);

/**
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * 毎回 `GlobalConfig.resetInstance()` でシングルトンをリセットしてから
 * `resetProjectRoot` でプロジェクトルートをシードして初期化する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト（例: `'chatlogsDir: /tmp/test'`）
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
const _makeGlobalConfig = async (yaml: string): Promise<GlobalConfig> => {
  resetProjectRoot('/home/user/project');
  GlobalConfig.resetInstance();
  return await GlobalConfig.getInstance({
    readTextFileProvider: () => yaml,
    configFile: 'dummy.yaml',
  });
};

/**
 * 1 回目の呼び出しをレートリミット（stderr にレートリミット文言、非ゼロ終了）で失敗させ、
 * 2 回目以降は `[]`（空判定結果）で成功させる `DenoCommandLike` を返す。
 *
 * `runAI` はレートリミット検出のため `stderr` を参照するため、`stderr` フィールドを持つ
 * 完全な `Deno.CommandOutput` を返す必要があり、共通モックの `BaseMockCommand` は使わない。
 *
 * @param counter - 呼び出し回数を記録するカウンター
 * @returns Deno.Command 互換のモッククラス
 */
const _makeRateLimitThenEmptyMock = (counter: { calls: number }): DenoCommandLike => {
  return class {
    private readonly isFirstCall: boolean;

    constructor(_cmd: string, _opts: unknown) {
      counter.calls++;
      this.isFirstCall = counter.calls === 1;
    }

    spawn() {
      return {
        stdin: { getWriter: () => ({ write: () => Promise.resolve(), close: () => Promise.resolve() }) },
        output: () => this.output(),
      };
    }

    output(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
      if (this.isFirstCall) {
        return Promise.resolve({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('rate limit exceeded'),
        });
      }
      return Promise.resolve({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode('[]'),
        stderr: new Uint8Array(),
      });
    }
  } as unknown as DenoCommandLike;
};

// ─── Tests

// ─── T-FL-E2E-01: dry-run → ファイル削除なし ─────────────────────────────────

/**
 * `main` 関数の E2E テストスイート（dry-run モード）。
 *
 * `--dry-run` フラグを指定した際に claude CLI を呼び出さず、対象ファイルを一覧表示するだけで
 * ファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-01
 *
 * @see main
 */
describe('main - dry-run モード', () => {
  /**
   * 1 件の `.md` ファイルと claude agent が存在する前提。
   *
   * `--dry-run` フラグ付きで main を呼び出した際に、claude CLI が呼ばれず、
   * ファイルも削除されないことを確認する。
   */
  describe('Given: 1 件の .md ファイル', () => {
    /** `main([...args, "--dry-run"])` を呼び出すとき。 */
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      /** dry-run モードでは claude CLI が呼ばれず、対象ファイルがログに一覧表示され、ファイルも削除されない。 */
      describe('Then: T-FL-E2E-01 - dry-run → claude CLI 未呼び出し・ファイル一覧表示・削除なし', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: chat.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/chat.md`, _makeValidContent());
          });

          it('T-FL-E2E-01-01: ファイルが削除されずに残る', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/chat.md`), true);
          });

          it('T-FL-E2E-01-02: 対象ファイルパスがログに一覧表示される', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('chat.md')), true);
          });

          it('T-FL-E2E-01-03: claude CLI が一度も呼ばれない', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-02: DISCARD 判定 → ファイルが削除される ───────────────────────

/**
 * `main` 関数の E2E テストスイート（DISCARD 判定）。
 *
 * Claude CLI が DISCARD を返した場合にファイルが削除されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-02
 *
 * @see main
 */
describe('main - DISCARD 判定', () => {
  /**
   * 1 件の `.md` ファイルと DISCARD 判定を返すモックが存在する前提。
   *
   * dryRun=false で main を呼び出した際に、confidence >= 0.7 の DISCARD ファイルが
   * 実際に削除されることを確認する。
   */
  describe('Given: 1 件の .md ファイルと DISCARD 判定モック（confidence=0.9）', () => {
    /** `main([...args])` を dryRun=false で呼び出すとき。 */
    describe('When: main([...args]) を呼び出す（dryRun=false）', () => {
      /** DISCARD 判定のファイルがファイルシステムから削除されること。 */
      describe('Then: T-FL-E2E-02 - ファイルが削除される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([{
                file: 'discard.md',
                decision: FILTER_DECISIONS.DISCARD,
                confidence: 0.9,
                reason: 'trivial',
              }]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard.md`, _makeValidContent());
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-02-01: ファイルが削除される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            await assertFileNotExist(`${chatlogsDir}/discard.md`);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-03: KEEP 判定 → ファイルが残る ─────────────────────────────────

/**
 * `main` 関数の E2E テストスイート（KEEP 判定）。
 *
 * Claude CLI が KEEP を返した場合にファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-03
 *
 * @see main
 */
describe('main - KEEP 判定', () => {
  /**
   * 1 件の `.md` ファイルと KEEP 判定を返すモックが存在する前提。
   *
   * KEEP 判定のファイルは削除されずにディレクトリに残ることを確認する。
   */
  describe('Given: 1 件の .md ファイルと KEEP 判定モック', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** KEEP 判定のファイルがファイルシステムに残っていること。 */
      describe('Then: T-FL-E2E-03 - ファイルが残る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([{
                file: 'keep.md',
                decision: FILTER_DECISIONS.KEEP,
                confidence: 0.9,
                reason: 'valuable',
              }]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: keep.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());
          });

          it('T-FL-E2E-03-01: ファイルが残っている', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/keep.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-14: model 配線 ─────────────────────────────────────────────────

/**
 * `main` 関数の E2E テストスイート（model 配線）。
 *
 * config.yaml の `model` 設定が claude CLI 起動引数の `--model` にそのまま反映されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-14
 *
 * @see main
 */
describe('main - model 配線', () => {
  /**
   * config.yaml に `model: haiku` を設定し、1 件の KEEP 判定ファイルが存在する前提。
   *
   * claude CLI の起動引数に `--model haiku` が反映されることを確認する。
   */
  describe('Given: config.yaml に model: haiku を設定・keep.md（KEEP判定）を配置', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI の起動引数に --model haiku が含まれること。 */
      describe('Then: T-FL-E2E-14 - claude CLI の起動引数に --model haiku が含まれる', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let capturedArgs: { value: string[] };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'\nmodel: haiku`);
          capturedArgs = { value: [] };
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([{
                file: 'keep.md',
                decision: FILTER_DECISIONS.KEEP,
                confidence: 0.9,
                reason: 'valuable',
              }]),
              capturedArgs,
            ),
          );
          loggerStub = makeLoggerStub();
          await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-FL-E2E-14-01: capturedArgs に --model と haiku が含まれる', async () => {
          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          const modelIndex = capturedArgs.value.indexOf('--model');
          assertEquals(modelIndex !== -1, true);
          assertEquals(capturedArgs.value[modelIndex + 1], 'haiku');
        });
      });
    });
  });
});

// ─── T-FL-E2E-04: 対象ファイルなし → Deno.exit(0) ───────────────────────────

/**
 * `main` 関数の E2E テストスイート（対象ファイルなし）。
 *
 * 対象 `.md` ファイルが存在しない場合に適切なログが出力されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-04
 *
 * @see main
 */
describe('main - 対象ファイルなし', () => {
  /**
   * `.md` ファイルが 0 件のディレクトリが存在する前提。
   *
   * 対象ファイルなし時に "対象ファイルなし" ログが出力されることを確認する。
   */
  describe('Given: .md ファイルが存在しないディレクトリ', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** "対象ファイルなし" を含む info ログが出力されること。 */
      describe('Then: T-FL-E2E-04 - "対象ファイルなし" ログが出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock('[]'),
          );
          loggerStub = makeLoggerStub();
          exitStub = stub(Deno, 'exit');
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          exitStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-FL-E2E-04-01: "対象ファイルなし" がログに出力される', async () => {
          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes(LOGGER_HEADER.NO_FILE_FOUND)), true);
        });
      });
    });
  });
});

// ─── T-FL-E2E-05: DISCARD + KEEP 混在 → DISCARD のみ削除 ────────────────────

/**
 * `main` 関数の E2E テストスイート（DISCARD + KEEP 混在）。
 *
 * DISCARD と KEEP が混在する場合に DISCARD ファイルのみ削除され、
 * KEEP ファイルは残ることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-05
 *
 * @see main
 */
describe('main - DISCARD + KEEP 混在', () => {
  /**
   * DISCARD ファイル 1 件と KEEP ファイル 1 件が混在する前提。
   *
   * DISCARD 判定のファイルのみ削除され、KEEP 判定のファイルは残ることを確認する。
   */
  describe('Given: discard.md（DISCARD）と keep.md（KEEP）が混在', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** DISCARD ファイルが削除され、KEEP ファイルがファイルシステムに残ること。 */
      describe('Then: T-FL-E2E-05 - DISCARD のみ削除、KEEP は残る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([
                { file: 'discard.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' },
                { file: 'keep.md', decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' },
              ]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard.md と keep.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard.md`, _makeValidContent());
            await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-05-01: discard.md が削除される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            await assertFileNotExist(`${chatlogsDir}/discard.md`);
          });

          it('T-FL-E2E-05-02: keep.md が残っている', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/keep.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-06: period 絞り込み → 指定月のみ処理 ──────────────────────────

/**
 * `main` 関数の E2E テストスイート（period 絞り込み）。
 *
 * period を指定した場合に指定月のファイルのみが処理対象となることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-06
 *
 * @see main
 */
describe('main - period 絞り込み', () => {
  /**
   * 2026-03 と 2026-04 の両月にファイルが存在し、period=2026-03 を指定する前提。
   *
   * 指定月（2026-03）のファイルのみが削除対象となり、他月（2026-04）は
   * 影響を受けないことを確認する。
   */
  describe('Given: 複数月のファイルがある場合に period 指定', () => {
    /** `main([...args, "2026-03"])` を period=2026-03 で呼び出すとき。 */
    describe('When: main([...args, "2026-03"]) を呼び出す', () => {
      /** 指定月のファイルのみが削除対象となり、他月のファイルは残ること。 */
      describe('Then: T-FL-E2E-06 - 指定月のファイルのみ削除対象になる', () => {
        let tempDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          tempDir = await Deno.makeTempDir();
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([{
                file: 'march.md',
                decision: FILTER_DECISIONS.DISCARD,
                confidence: 0.9,
                reason: 'trivial',
              }]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: 2026-03/march.md と 2026-04/april.md を配置', () => {
          beforeEach(async () => {
            // 探索ディレクトリは GlobalConfig.chatlogsDir + originalLogs から解決されるため、
            // ファイルは originalLogs 配下に作成する。
            const agentDir = `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude`;
            await Deno.mkdir(`${agentDir}/2026/2026-03`, { recursive: true });
            await Deno.mkdir(`${agentDir}/2026/2026-04`, { recursive: true });
            await Deno.writeTextFile(`${agentDir}/2026/2026-03/march.md`, _makeValidContent('March'));
            await Deno.writeTextFile(`${agentDir}/2026/2026-04/april.md`, _makeValidContent('April'));
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`chatlogsDir: '${tempDir}'\ncacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-06-01: 指定月 (2026-03) のファイルが削除される', async () => {
            await main(['claude', '2026-03']);

            await assertFileNotExist(`${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude/2026/2026-03/march.md`);
          });

          it('T-FL-E2E-06-02: 他の月 (2026-04) のファイルは残っている', async () => {
            await main(['claude', '2026-03']);

            assertEquals(
              await fileExists(`${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude/2026/2026-04/april.md`),
              true,
            );
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-07: Claude CLI NotFound → throw され main が reject される ────

/**
 * `main` 関数の E2E テストスイート（Claude CLI NotFound）。
 *
 * claude コマンドが見つからない（`Deno.errors.NotFound`）場合、`ChatlogError` ではない
 * 想定外の異常として握りつぶさず throw され、`main` が reject されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-07
 *
 * @see main
 */
describe('main - Claude CLI NotFound', () => {
  /**
   * claude コマンドが存在しない（NotFoundError）モックが設定されている前提。
   *
   * Claude CLI が利用できない場合、`main` が `Deno.errors.NotFound` で reject されることを確認する。
   */
  describe('Given: claude コマンドが存在しないモック', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** Claude CLI NotFound 時に main が reject されること。 */
      describe('Then: T-FL-E2E-07 - main が NotFound で reject される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(makeNotFoundMock());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: chat.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/chat.md`, _makeValidContent());
          });

          it('T-FL-E2E-07-01: NotFound エラーで main が reject される', async () => {
            const _error = await assertRejects(
              () => main(['claude', '2026-03', '--input-dir', chatlogsDir]),
              ChatlogError,
            );

            assertEquals(_error.kind, 'ParallelExecutionError');
            assertEquals(_error.subindex, 'NotFound');
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-08: confidence 閾値未満 → 削除されない ────────────────────────

/**
 * `main` 関数の E2E テストスイート（confidence 閾値未満）。
 *
 * DISCARD 判定でも confidence が 0.7 未満の場合にファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-08
 *
 * @see main
 */
describe('main - confidence 閾値未満', () => {
  /**
   * DISCARD 判定だが confidence=0.69（閾値 0.7 未満）のモックが存在する前提。
   *
   * confidence が閾値を下回る場合はファイルが削除されずに残ることを確認する。
   */
  describe('Given: DISCARD 判定だが confidence=0.69 のモック', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** confidence < 0.7 の DISCARD ファイルがファイルシステムに残ること。 */
      describe('Then: T-FL-E2E-08 - ファイルが削除されない', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([{
                file: 'low-conf.md',
                decision: FILTER_DECISIONS.DISCARD,
                confidence: 0.69,
                reason: 'uncertain',
              }]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: low-conf.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/low-conf.md`, _makeValidContent());
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-08-01: confidence=0.69 の DISCARD ファイルが削除されずに残っている', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/low-conf.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-09: Claude CLI 異常終了 → 全件 KEEP 扱い ─────────────────────

/**
 * `main` 関数の E2E テストスイート（Claude CLI 異常終了）。
 *
 * claude コマンドが異常終了（exit code != 0）した場合に全件 KEEP 扱いとなり
 * ファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-09
 *
 * @see main
 */
describe('main - Claude CLI 異常終了', () => {
  /**
   * claude コマンドが exit code=1 で失敗するモックが設定されている前提。
   *
   * CLI が異常終了した場合に全ファイルを KEEP 扱いとし、
   * ファイルが削除されないことを確認する。
   */
  describe('Given: claude コマンドが exit code=1 で失敗するモック', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** CLI 異常終了時にファイルが全件 KEEP 扱いで残ること。 */
      describe('Then: T-FL-E2E-09 - ファイルが削除されない', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(makeFailMock(1));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: chat.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/chat.md`, _makeValidContent());
          });

          it('T-FL-E2E-09-01: ファイルが残っている（全件 KEEP 扱い）', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/chat.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-11: 存在しない period → InputNotFound ─────────────────────────

/**
 * `main` 関数の E2E テストスイート（存在しない period ディレクトリ）。
 *
 * period を指定したとき、その月ディレクトリが存在しない場合に
 * `ChatlogError` が throw され、`main` が reject されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-11
 *
 * @see main
 */
describe('main - 存在しない period ディレクトリ → InputNotFound', () => {
  /**
   * agent ディレクトリは存在するが、period ディレクトリ（2026-99）が存在しない前提。
   *
   * period 込みで存在確認を行い、存在しない場合は `ChatlogError` が throw されることを確認する。
   */
  describe('Given: agent ディレクトリは存在するが period ディレクトリが存在しない', () => {
    /** `main(["claude", "2026-99"])` を呼び出すとき（GlobalConfig に chatlogsDir を設定）。 */
    describe('When: main(["claude", "2026-99"]) を呼び出す', () => {
      /** `ChatlogError` が throw され `main` が reject されること。 */
      describe('Then: T-FL-E2E-11 - main が ChatlogError で reject される', () => {
        let tempDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          // agent ディレクトリは存在するが、2026-99 月ディレクトリは存在しない
          ({ tempDir } = await _makeTestDirs('claude', '2026-03'));
          // 探索ディレクトリは GlobalConfig.chatlogsDir + originalLogs から解決されるため、
          // agent ディレクトリは originalLogs 配下に作成する。
          const originalLogsAgentDir = `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude/2026/2026-03`;
          await Deno.mkdir(originalLogsAgentDir, { recursive: true });
          await _makeGlobalConfig(`chatlogsDir: '${tempDir}'`);
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-FL-E2E-11-01: ChatlogError で main が reject される', async () => {
          await assertRejects(
            () => main(['claude', '2026-99']),
            ChatlogError,
          );
        });
      });
    });
  });
});

// ─── T-FL-E2E-10: period 未指定 → 全月が処理対象 ────────────────────────────

/**
 * `main` 関数の E2E テストスイート（period 未指定）。
 *
 * period を指定しない場合に全月のファイルが処理対象となることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-10
 *
 * @see main
 */
describe('main - period 未指定', () => {
  /**
   * 2026-03 と 2026-04 の両月に DISCARD ファイルが存在し、period を指定しない前提。
   *
   * period 未指定時は全月のファイルが処理対象となり、両月のファイルが削除されることを確認する。
   */
  describe('Given: 複数月に DISCARD ファイルが存在し period 未指定', () => {
    /** `main(["claude"])` を period なしで呼び出すとき（GlobalConfig に chatlogsDir を設定）。 */
    describe('When: main(["claude"]) を呼び出す', () => {
      /** 両月のファイルが削除対象になること。 */
      describe('Then: T-FL-E2E-10 - 全月のファイルが処理される', () => {
        let tempDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          tempDir = await Deno.makeTempDir();
          commandHandle = installCommandMock(
            makeClaudeJsonMock(
              JSON.stringify([
                { file: 'march.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' },
                { file: 'april.md', decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' },
              ]),
            ),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: 2026-03/march.md と 2026-04/april.md を配置', () => {
          beforeEach(async () => {
            // 探索ディレクトリは GlobalConfig.chatlogsDir + originalLogs から解決されるため、
            // ファイルは originalLogs 配下に作成する。
            const agentDir = `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude`;
            await Deno.mkdir(`${agentDir}/2026/2026-03`, { recursive: true });
            await Deno.mkdir(`${agentDir}/2026/2026-04`, { recursive: true });
            await Deno.writeTextFile(`${agentDir}/2026/2026-03/march.md`, _makeValidContent('March'));
            await Deno.writeTextFile(`${agentDir}/2026/2026-04/april.md`, _makeValidContent('April'));
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`chatlogsDir: '${tempDir}'\ncacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-10-01: 2026-03 のファイルが削除される', async () => {
            await main(['claude']);

            await assertFileNotExist(`${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude/2026/2026-03/march.md`);
          });

          it('T-FL-E2E-10-02: 2026-04 のファイルが削除される', async () => {
            await main(['claude']);

            await assertFileNotExist(`${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/claude/2026/2026-04/april.md`);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-12: キャッシュ KEEP 済み → claude CLI 未呼び出し ──────────────

/**
 * `main` 関数の E2E テストスイート（キャッシュ済み KEEP 判定）。
 *
 * ファイル単位の判定結果キャッシュに `decision: KEEP` が既に記録されている場合、
 * `prefilterFiles` に渡す前に対象から除外され、claude CLI が呼び出されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-12
 *
 * @see main
 */
describe('main - キャッシュ KEEP 済み', () => {
  /**
   * キャッシュに `keep.md` の判定結果として `decision: KEEP` が既に書き込まれている前提。
   *
   * キャッシュ済み KEEP ファイルは claude CLI 呼び出し前に除外され、
   * ファイルシステム上にも残ることを確認する。
   */
  describe('Given: cacheDir に keep.md の KEEP キャッシュエントリを配置', () => {
    /** `main(["claude", "2026-03", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI が呼び出されず、ファイルが残ること。 */
      describe('Then: T-FL-E2E-12 - claude CLI 未呼び出し・ファイルが残る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: keep.md を chatlogsDir に配置し、cacheDir に KEEP エントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/keep.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-12-01: claude CLI が呼び出されない', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });

          it('T-FL-E2E-12-02: keep.md が残っている', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/keep.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-13: キャッシュ DISCARD 確定済み → claude CLI 未呼び出し ───────

/**
 * `main` 関数の E2E テストスイート（キャッシュ済み DISCARD マーク済み判定）。
 *
 * ファイル単位の判定結果キャッシュに `decision: DISCARD` が既に記録されている場合、
 * confidence の値によらず `prefilterFiles` に渡す前に対象から除外され、
 * claude CLI が呼び出されないことを検証する。
 * さらに、このマーク済み（ゾンビ）ファイルは `sweepDiscards` により削除されることを検証する。
 *
 * confidence が discardThreshold 未満でもマーク済みとして扱われ削除されることも
 * 対比ケースとして検証する（T-FL-E2E-13-03, -04）。
 *
 * テスト ID 範囲: T-FL-E2E-13
 *
 * @see main
 */
describe('main - キャッシュ DISCARD マーク済み', () => {
  /**
   * キャッシュに `discard-cached.md` の判定結果として
   * `decision: DISCARD, confidence: 0.9` が既に書き込まれている前提。
   *
   * キャッシュ済み DISCARD マーク済みファイルは claude CLI 呼び出し前に除外されるが、
   * mark-then-sweep のスイープフェーズにより実ファイルは削除される（ゾンビファイル解消）。
   */
  describe('Given: cacheDir に discard-cached.md の DISCARD 確定キャッシュエントリを配置', () => {
    /** `main(["claude", "2026-03", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI が呼び出されず、ファイルが削除されること。 */
      describe('Then: T-FL-E2E-13 - claude CLI 未呼び出し・ファイルが削除される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard-cached.md を chatlogsDir に配置し、cacheDir に DISCARD 確定エントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard-cached.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/discard-cached.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-13-01: claude CLI が呼び出されない', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });

          it('T-FL-E2E-13-02: discard-cached.md が削除される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            await assertFileNotExist(`${chatlogsDir}/discard-cached.md`);
          });
        });
      });
    });
  });

  /**
   * キャッシュに `discard-low-conf.md` の判定結果として
   * `decision: DISCARD, confidence: 0.69`（discardThreshold=0.7 未満）が既に書き込まれている前提。
   *
   * mark フェーズ簡略化後は confidence を再チェックしないため、キャッシュ上 `decision: DISCARD` は
   * confidence によらずマーク済みとして扱われ、claude CLI 呼び出し前に除外されスイープで削除される。
   */
  describe('Given: cacheDir に discard-low-conf.md の DISCARD マーク済み（confidence 閾値未満）キャッシュエントリを配置', () => {
    /** `main(["claude", "2026-03", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI が呼び出されず、ファイルが削除されること。 */
      describe('Then: T-FL-E2E-13 - claude CLI 未呼び出し・ファイルが削除される（confidence によらずマーク済み扱い）', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard-low-conf.md を chatlogsDir に配置し、cacheDir に DISCARD マーク済みエントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard-low-conf.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/discard-low-conf.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.DISCARD, confidence: 0.69, reason: 'uncertain' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-13-03: claude CLI が呼び出されない', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });

          it('T-FL-E2E-13-04: discard-low-conf.md が削除される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            await assertFileNotExist(`${chatlogsDir}/discard-low-conf.md`);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-14: 新規判定対象なし + ゾンビファイルあり → ゾンビも削除される ─

/**
 * `main` 関数の E2E テストスイート（新規判定対象なし・ゾンビファイルのみ）。
 *
 * `prefilterFiles` 通過後の新規判定対象が 0 件（`total === 0`）でも、
 * キャッシュ上 DISCARD 確定済みで実ファイルが残っているゾンビファイルが存在する場合、
 * スイープフェーズが実行され削除されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-14
 *
 * @see main
 */
describe('main - 新規判定対象なし・ゾンビファイルのみ', () => {
  /**
   * `zombie-only.md` がキャッシュ上 DISCARD 確定済み（除外対象）で、他に新規判定対象ファイルがない前提。
   *
   * `total === 0` の早期分岐を通ってもスイープフェーズが実行され、
   * ゾンビファイルが削除されることを確認する。
   */
  describe('Given: cacheDir に DISCARD 確定済みエントリのみが存在し新規判定対象がない', () => {
    /** `main(["claude", "2026-03", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI が呼び出されず、ゾンビファイルが削除されること。 */
      describe('Then: T-FL-E2E-14 - claude CLI 未呼び出し・ゾンビファイルが削除される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: zombie-only.md を chatlogsDir に配置し、cacheDir に DISCARD 確定エントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/zombie-only.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/zombie-only.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-14-01: claude CLI が呼び出されない', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });

          it('T-FL-E2E-14-02: zombie-only.md が削除される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            await assertFileNotExist(`${chatlogsDir}/zombie-only.md`);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-15: dry-run 時はゾンビファイルも削除されず stats.skip 計上 ────

/**
 * `main` 関数の E2E テストスイート（dry-run 時のゾンビファイル）。
 *
 * `--dry-run` フラグ指定時は、キャッシュ上 DISCARD 確定済みのゾンビファイルであっても
 * 削除を実行せず、ログにも削除されない旨が確認できることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-15
 *
 * @see main
 */
describe('main - dry-run 時のゾンビファイル', () => {
  /**
   * `zombie-dry.md` がキャッシュ上 DISCARD 確定済みで、`--dry-run` フラグを指定する前提。
   *
   * dry-run 時はスイープフェーズでも削除を実行せず、ファイルが残ることを確認する。
   */
  describe('Given: cacheDir に DISCARD 確定済みエントリを配置し --dry-run を指定', () => {
    /** `main(["claude", "2026-03", "--dry-run", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** claude CLI が呼び出されず、ゾンビファイルが削除されずに残ること。 */
      describe('Then: T-FL-E2E-15 - claude CLI 未呼び出し・ゾンビファイルが削除されない', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: zombie-dry.md を chatlogsDir に配置し、cacheDir に DISCARD 確定エントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/zombie-dry.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/zombie-dry.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.DISCARD, confidence: 0.9, reason: 'trivial' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-15-01: claude CLI が呼び出されない', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(counter.calls, 0);
          });

          it('T-FL-E2E-15-02: zombie-dry.md が削除されずに残っている', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(await fileExists(`${chatlogsDir}/zombie-dry.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-16: レートリミット abort → 未実行チャンクが stats.skip に計上される ─

/**
 * `main` 関数の E2E テストスイート（レートリミットによる未実行チャンク）。
 *
 * `chunkSize=1, concurrency=1` の下で 3 件のファイルを処理する際、
 * 1 チャンク目でレートリミットが発生し `ctl.abort()` が呼ばれた場合、
 * 未着手の 2 チャンク（2 ファイル）が `stats.skip` に加算され、
 * レートリミットを検出したチャンク自体は `stats.error` に計上される
 * （二重計上されない）ことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-16
 *
 * @see main
 */
describe('main - レートリミットによる未実行チャンク', () => {
  /**
   * 3 件の .md ファイルが存在し、claude CLI の 1 回目呼び出しがレートリミットで失敗する前提。
   *
   * chunkSize=1, concurrency=1 のため、1 ファイル = 1 チャンクとして扱われる。
   * 1 チャンク目でレートリミットが発生し以降のチャンクが未実行になることを確認する。
   */
  describe('Given: 3 件の .md ファイルと chunkSize=1・concurrency=1・レートリミットモック', () => {
    /** `main([...args])` を dryRun=false で呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 未実行チャンク分のファイル数が stats.skip に計上され、警告ログが 1 回出力されること。 */
      describe('Then: T-FL-E2E-16 - 未実行チャンクが stats.skip に計上され警告ログが出る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(_makeRateLimitThenEmptyMock(counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: file1.md, file2.md, file3.md を chatlogsDir に配置し chunkSize=1・concurrency=1 を設定', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/file1.md`, _makeValidContent('file1'));
            await Deno.writeTextFile(`${chatlogsDir}/file2.md`, _makeValidContent('file2'));
            await Deno.writeTextFile(`${chatlogsDir}/file3.md`, _makeValidContent('file3'));
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'\nchunkSize: 1\nconcurrency: 1`);
          });

          it('T-FL-E2E-16-01: 未実行チャンク分の 2 ファイルが stats.skip に計上される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('skip=2')), true);
          });

          it('T-FL-E2E-16-02: レートリミットを検出したチャンクは stats.error に計上される（二重計上なし）', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('error=1')), true);
          });

          it('T-FL-E2E-16-03: 未実行チャンク発生時に警告ログが 1 回出力される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            const matched = loggerStub.warnLogs.filter((l) => l.includes('チャンク') && l.includes('取りやめ'));
            assertEquals(matched.length, 1);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-17: 全チャンク正常実行 → 判定対象数と判定済み数が一致 ─────────

/**
 * `main` 関数の E2E テストスイート（判定集計ログ・正常系）。
 *
 * RateLimit なしで全チャンクが正常実行された場合、判定候補数・判定対象数・判定済み数が
 * ログに出力され、判定対象数と判定済み数が一致することを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-17
 *
 * @see main
 */
describe('main - 判定集計ログ（正常系）', () => {
  /**
   * 1 件の .md ファイルが存在し、claude CLI が正常に空の判定結果を返す前提。
   *
   * 全チャンクが正常実行されるため、判定対象数と判定済み数が一致することを確認する。
   */
  describe('Given: 1 件の .md ファイルと正常応答モック', () => {
    /** `main([...args])` を dryRun=false で呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 判定候補数・判定対象数・判定済み数がログに出力され、判定対象数と判定済み数が一致すること。 */
      describe('Then: T-FL-E2E-17 - 判定候補数・判定対象数・判定済み数がログに出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock('[]'),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: chat.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/chat.md`, _makeValidContent());
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-17-01: 判定候補数（candidates=1）がログに出力される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('candidates=1')), true);
          });

          it('T-FL-E2E-17-02: 判定済み数（judged=1）がログに出力される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('judged=1')), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-18: レートリミット abort → 判定済み数が判定対象数を下回る ─────

/**
 * `main` 関数の E2E テストスイート（判定集計ログ・レートリミット）。
 *
 * RateLimit により一部チャンクが未実行になった場合、判定済み数が判定対象数より
 * 小さくなり、その差分が未実行チャンクのファイル数と一致することを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-18
 *
 * @see main
 */
describe('main - 判定集計ログ（レートリミット）', () => {
  /**
   * 3 件の .md ファイルが存在し、claude CLI の 1 回目呼び出しがレートリミットで失敗する前提。
   *
   * chunkSize=1, concurrency=1 のため、1 チャンク目でレートリミットが発生し
   * 残り 2 チャンク（2 ファイル）が未実行になる。判定済み数は 1 件になる。
   */
  describe('Given: 3 件の .md ファイルと chunkSize=1・concurrency=1・レートリミットモック', () => {
    /** `main([...args])` を dryRun=false で呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 判定済み数が判定対象数より小さく、差分が未実行チャンクのファイル数と一致すること。 */
      describe('Then: T-FL-E2E-18 - 判定済み数が判定対象数を下回る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(_makeRateLimitThenEmptyMock(counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: file1.md, file2.md, file3.md を chatlogsDir に配置し chunkSize=1・concurrency=1 を設定', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/file1.md`, _makeValidContent('file1'));
            await Deno.writeTextFile(`${chatlogsDir}/file2.md`, _makeValidContent('file2'));
            await Deno.writeTextFile(`${chatlogsDir}/file3.md`, _makeValidContent('file3'));
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'\nchunkSize: 1\nconcurrency: 1`);
          });

          it('T-FL-E2E-18-01: 判定候補数（candidates=3）がログに出力される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('candidates=3')), true);
          });

          it('T-FL-E2E-18-02: 判定済み数（judged=1）がログに出力される（判定対象数 3 から未実行 2 件を差し引いた値）', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('judged=1')), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-19: 判定対象なし → 判定候補数のみログに出力される ─────────────

/**
 * `main` 関数の E2E テストスイート（判定集計ログ・判定対象なし）。
 *
 * `prefilterFiles` 通過後の判定対象が 0 件の場合でも、`total === 0` の早期分岐より前に
 * 全体数・判定候補数がログに出力されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-19
 *
 * @see main
 */
describe('main - 判定集計ログ（判定対象なし）', () => {
  /**
   * `.md` ファイルが 0 件のディレクトリが存在する前提。
   *
   * 判定候補数（candidates=0）が `total === 0` の早期分岐より前にログ出力されることを確認する。
   */
  describe('Given: .md ファイルが存在しないディレクトリ', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 判定候補数（candidates=0）がログに出力されること。 */
      describe('Then: T-FL-E2E-19 - 判定候補数（candidates=0）がログに出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeClaudeJsonMock('[]'),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-FL-E2E-19-01: 判定候補数（candidates=0）がログに出力される', async () => {
          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('candidates=0')), true);
        });
      });
    });
  });
});

// ─── T-FL-E2E-20: dry-run → 判定済み数が 0 になる ────────────────────────────

/**
 * `main` 関数の E2E テストスイート（判定集計ログ・dry-run）。
 *
 * `--dry-run` フラグ指定時は claude CLI を呼び出さないため、判定済み数が 0 に
 * なることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-20
 *
 * @see main
 */
describe('main - 判定集計ログ（dry-run）', () => {
  /**
   * 1 件の `.md` ファイルが存在し、`--dry-run` フラグを指定する前提。
   *
   * dry-run モードでは claude CLI 判定を実施しないため、判定済み数が 0 になることを確認する。
   */
  describe('Given: 1 件の .md ファイルと --dry-run 指定', () => {
    /** `main([...args, "--dry-run"])` を呼び出すとき。 */
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      /** 判定済み数（judged=0）がログに出力されること。 */
      describe('Then: T-FL-E2E-20 - 判定済み数（judged=0）がログに出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: chat.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/chat.md`, _makeValidContent());
          });

          it('T-FL-E2E-20-01: 判定済み数（judged=0）がログに出力される', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.dryrunLogs.some((l) => l.includes('judged=0')), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-21: 全ファイルキャッシュ済み → 判定候補数が 0 になる ──────────

/**
 * `main` 関数の E2E テストスイート（判定集計ログ・全ファイルキャッシュ済み）。
 *
 * 全ファイルがキャッシュ済み（KEEP/DISCARD 確定）で `_targetEntries` が空の場合、
 * 判定候補数（candidates=0）がログに出力されることを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-21
 *
 * @see main
 */
describe('main - 判定集計ログ（全ファイルキャッシュ済み）', () => {
  /**
   * `keep.md` がキャッシュ上 KEEP 確定済みで、他に新規判定対象ファイルがない前提。
   *
   * 全ファイルがキャッシュ済みのため `_targetEntries` が空になり、
   * 判定候補数（candidates=0）がログに出力されることを確認する。
   */
  describe('Given: cacheDir に keep.md の KEEP キャッシュエントリのみが存在する', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** 判定候補数（candidates=0）がログに出力されること。 */
      describe('Then: T-FL-E2E-21 - 判定候補数（candidates=0）がログに出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(makeCountingMock('[]', counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: keep.md を chatlogsDir に配置し、cacheDir に KEEP エントリを書き込む', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());

            const cacheDir = `${tempDir}/cache/filter-cache`;
            await Deno.mkdir(cacheDir, { recursive: true });
            await Deno.writeTextFile(
              `${cacheDir}/keep.json`,
              JSON.stringify({ decision: FILTER_DECISIONS.KEEP, confidence: 0.9, reason: 'valuable' }),
            );

            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'`);
          });

          it('T-FL-E2E-21-01: 判定候補数（candidates=0）がログに出力される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('candidates=0')), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-22: --single-file 指定 → chunkSize が1に上書きされる ──────────

/**
 * `main` 関数の E2E テストスイート（--single-file フラグ）。
 *
 * `--single-file` を指定した場合、GlobalConfig の chunkSize 設定によらず
 * 実効 chunkSize が 1 に強制上書きされることを検証する。
 *
 * GlobalConfig の chunkSize はデフォルト（10）のまま `--single-file` のみを指定し、
 * 3 件のファイルのうち 1 チャンク目がレートリミットで失敗した場合に
 * 残り 2 チャンク（2 ファイル）が未実行になる（= 1 ファイルずつ 3 チャンクに
 * 分割された）ことを確認する。chunkSize が上書きされなければ 3 件は 1 チャンクに
 * まとまり、レートリミット発生時に未実行ファイルは 0 件になるため、このテストは
 * `--single-file` の上書きが機能しているかを判別できる。
 *
 * テスト ID 範囲: T-FL-E2E-22
 *
 * @see main
 */
describe('main - --single-file フラグ', () => {
  /**
   * 3 件の .md ファイルが存在し、claude CLI の 1 回目呼び出しがレートリミットで失敗する前提。
   *
   * GlobalConfig の chunkSize はデフォルトのまま `--single-file` のみを CLI 引数で指定する。
   */
  describe('Given: 3 件の .md ファイルと --single-file・レートリミットモック（GlobalConfig の chunkSize は未設定）', () => {
    /** `main([...args, "--single-file"])` を dryRun=false で呼び出すとき。 */
    describe('When: main([...args, "--single-file"]) を呼び出す', () => {
      /** 未実行チャンク分の 2 ファイルが stats.skip に計上されること（chunkSize=1 に上書きされた証跡）。 */
      describe('Then: T-FL-E2E-22 - 未実行チャンクが stats.skip に計上される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let counter: { calls: number };

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          counter = { calls: 0 };
          commandHandle = installCommandMock(_makeRateLimitThenEmptyMock(counter));
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: file1.md, file2.md, file3.md を chatlogsDir に配置（chunkSize は GlobalConfig デフォルト）', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/file1.md`, _makeValidContent('file1'));
            await Deno.writeTextFile(`${chatlogsDir}/file2.md`, _makeValidContent('file2'));
            await Deno.writeTextFile(`${chatlogsDir}/file3.md`, _makeValidContent('file3'));
            // 判定結果キャッシュを tempDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            // chunkSize は指定しない（GlobalConfig デフォルト値のまま）
            await _makeGlobalConfig(`cacheDir: '${tempDir}/cache'\nconcurrency: 1`);
          });

          it('T-FL-E2E-22-01: 未実行チャンク分の 2 ファイルが stats.skip に計上される', async () => {
            await main(['claude', '2026-03', '--input-dir', chatlogsDir, '--single-file']);

            assertEquals(loggerStub.infoLogs.some((l) => l.includes('skip=2')), true);
          });
        });
      });
    });
  });
});
