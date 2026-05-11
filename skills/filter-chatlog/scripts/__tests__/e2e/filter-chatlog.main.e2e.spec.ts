// src: scripts/__tests__/e2e/filter-chatlog.main.e2e.spec.ts
// @(#): filter-chatlog main() の E2E テスト
//       main() 経由でのフィルタリングフロー（Deno.Command モック・実 tempdir）
//
//       filter-chatlog の動作:
//         入力: inputDir/agent/YYYY/YYYY-MM/*.md
//         DISCARD 判定かつ confidence >= 0.7 のファイルを削除する
//         (classify-chatlogs と異なり、移動ではなく削除)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../../../filter-chatlog/scripts/filter-chatlog.ts';
// constants
import { LOGGER_HEADER } from '../../../../../skills/_scripts/constants/logger-header.constants.ts';

// ─── Helpers
// mocks
import {
  installCommandMock,
  makeFailMock,
  makeNotFoundMock,
  makeSuccessMock,
} from '../../../../../skills/_scripts/__tests__/helpers/deno-command-mock.ts';
// stub
import { makeLoggerStub } from '../../../../../skills/_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { FILTER_MIN_CONTENT_LENGTH } from '../_helpers/constants.ts';
// types
import type { CommandMockHandle } from '../../../../../skills/_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../../skills/_scripts/__tests__/helpers/logger-stub.ts';
// e2e helpers
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { assertFileNotExists } from '../_helpers/chatlog-asserts.ts';
import { makeRepeatedContent, makeTestDirs } from '../_helpers/chatlog-fixtures.ts';

// ─── Internal Helpers

// functions

/** `_makeTestDirs` のラッパー。デフォルト引数付きで `makeTestDirs` を呼び出す。 */
const _makeTestDirs = (agent = 'claude', period = '2026-03') => makeTestDirs(agent, period);

/** `_makeValidContent` のラッパー。`FILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = (title = 'テスト') => makeRepeatedContent(FILTER_MIN_CONTENT_LENGTH, title);

// ─── Tests

// ─── T-FL-E2E-01: dry-run → ファイル削除なし ─────────────────────────────────

/**
 * `main` 関数の E2E テストスイート（dry-run モード）。
 *
 * `--dry-run` フラグを指定した際にファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-01
 *
 * @see main
 */
describe('main - dry-run モード', () => {
  /**
   * 1 件の `.md` ファイルと claude agent が存在する前提。
   *
   * `--dry-run` フラグ付きで main を呼び出した際に、DISCARD 判定でもファイルが
   * 削除されないことを確認する。
   */
  describe('Given: 1 件の .md ファイルと DISCARD 判定モック', () => {
    /** `main([...args, "--dry-run"])` を呼び出すとき。 */
    describe('When: main([...args, "--dry-run"]) を呼び出す', () => {
      /** dry-run モードではファイルが削除されず、`[dry-run]` ログが出力されること。 */
      describe('Then: T-FL-E2E-01 - dry-run → ファイルが削除されない', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([{ file: 'chat.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' }]),
            )),
          );
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

          it('T-FL-E2E-01-01: ファイルが削除されずに残り "[dry-run]" がログに出力される', async () => {
            await main(['claude', '2026-03', '--dry-run', '--input', tempDir]);

            assertEquals(await fileExists(`${chatlogsDir}/chat.md`), true);
            assertEquals(loggerStub.logLogs.some((l) => l.includes('[dry-run]')), true);
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
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([{ file: 'discard.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' }]),
            )),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard.md`, _makeValidContent());
          });

          it('T-FL-E2E-02-01: ファイルが削除される', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

            await assertFileNotExists(`${chatlogsDir}/discard.md`);
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
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([{ file: 'keep.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' }]),
            )),
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
            await main(['claude', '2026-03', '--input', tempDir]);

            assertEquals(await fileExists(`${chatlogsDir}/keep.md`), true);
          });
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
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let exitStub: Stub;

        beforeEach(async () => {
          ({ tempDir } = await _makeTestDirs());
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('[]')),
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
          await main(['claude', '2026-03', '--input', tempDir]);

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
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([
                { file: 'discard.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' },
                { file: 'keep.md', decision: 'KEEP', confidence: 0.9, reason: 'valuable' },
              ]),
            )),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: discard.md と keep.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/discard.md`, _makeValidContent());
            await Deno.writeTextFile(`${chatlogsDir}/keep.md`, _makeValidContent());
          });

          it('T-FL-E2E-05-01: discard.md が削除される', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

            await assertFileNotExists(`${chatlogsDir}/discard.md`);
          });

          it('T-FL-E2E-05-02: keep.md が残っている', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

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
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([{ file: 'march.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' }]),
            )),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: 2026-03/march.md と 2026-04/april.md を配置', () => {
          beforeEach(async () => {
            const agentDir = `${tempDir}/claude`;
            await Deno.mkdir(`${agentDir}/2026/2026-03`, { recursive: true });
            await Deno.mkdir(`${agentDir}/2026/2026-04`, { recursive: true });
            await Deno.writeTextFile(`${agentDir}/2026/2026-03/march.md`, _makeValidContent('March'));
            await Deno.writeTextFile(`${agentDir}/2026/2026-04/april.md`, _makeValidContent('April'));
          });

          it('T-FL-E2E-06-01: 指定月 (2026-03) のファイルが削除される', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

            await assertFileNotExists(`${tempDir}/claude/2026/2026-03/march.md`);
          });

          it('T-FL-E2E-06-02: 他の月 (2026-04) のファイルは残っている', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

            assertEquals(await fileExists(`${tempDir}/claude/2026/2026-04/april.md`), true);
          });
        });
      });
    });
  });
});

// ─── T-FL-E2E-07: Claude CLI NotFound → 全件 KEEP 扱い ─────────────────────

/**
 * `main` 関数の E2E テストスイート（Claude CLI NotFound）。
 *
 * claude コマンドが見つからない場合に全件 KEEP 扱いとなりファイルが
 * 削除されないことを検証する。
 *
 * テスト ID 範囲: T-FL-E2E-07
 *
 * @see main
 */
describe('main - Claude CLI NotFound', () => {
  /**
   * claude コマンドが存在しない（NotFoundError）モックが設定されている前提。
   *
   * Claude CLI が利用できない場合に全ファイルを KEEP 扱いとし、
   * ファイルが削除されないことを確認する。
   */
  describe('Given: claude コマンドが存在しないモック', () => {
    /** `main([...args])` を呼び出すとき。 */
    describe('When: main([...args]) を呼び出す', () => {
      /** Claude CLI NotFound 時にファイルが全件 KEEP 扱いで残ること。 */
      describe('Then: T-FL-E2E-07 - ファイルが削除されない', () => {
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

          it('T-FL-E2E-07-01: ファイルが残っている（全件 KEEP 扱い）', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

            assertEquals(await fileExists(`${chatlogsDir}/chat.md`), true);
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
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([{ file: 'low-conf.md', decision: 'DISCARD', confidence: 0.69, reason: 'uncertain' }]),
            )),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: low-conf.md を chatlogsDir に配置', () => {
          beforeEach(async () => {
            await Deno.writeTextFile(`${chatlogsDir}/low-conf.md`, _makeValidContent());
          });

          it('T-FL-E2E-08-01: confidence=0.69 の DISCARD ファイルが削除されずに残っている', async () => {
            await main(['claude', '2026-03', '--input', tempDir]);

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
            await main(['claude', '2026-03', '--input', tempDir]);

            assertEquals(await fileExists(`${chatlogsDir}/chat.md`), true);
          });
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
    /** `main(["claude", "--input", tempDir])` を period なしで呼び出すとき。 */
    describe('When: main(["claude", "--input", tempDir]) を呼び出す', () => {
      /** 両月のファイルが削除対象になること。 */
      describe('Then: T-FL-E2E-10 - 全月のファイルが処理される', () => {
        let tempDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          tempDir = await Deno.makeTempDir();
          commandHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(
              JSON.stringify([
                { file: 'march.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' },
                { file: 'april.md', decision: 'DISCARD', confidence: 0.9, reason: 'trivial' },
              ]),
            )),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        describe('Given: 2026-03/march.md と 2026-04/april.md を配置', () => {
          beforeEach(async () => {
            const agentDir = `${tempDir}/claude`;
            await Deno.mkdir(`${agentDir}/2026/2026-03`, { recursive: true });
            await Deno.mkdir(`${agentDir}/2026/2026-04`, { recursive: true });
            await Deno.writeTextFile(`${agentDir}/2026/2026-03/march.md`, _makeValidContent('March'));
            await Deno.writeTextFile(`${agentDir}/2026/2026-04/april.md`, _makeValidContent('April'));
          });

          it('T-FL-E2E-10-01: 2026-03 のファイルが削除される', async () => {
            await main(['claude', '--input', tempDir]);

            await assertFileNotExists(`${tempDir}/claude/2026/2026-03/march.md`);
          });

          it('T-FL-E2E-10-02: 2026-04 のファイルが削除される', async () => {
            await main(['claude', '--input', tempDir]);

            await assertFileNotExists(`${tempDir}/claude/2026/2026-04/april.md`);
          });
        });
      });
    });
  });
});
