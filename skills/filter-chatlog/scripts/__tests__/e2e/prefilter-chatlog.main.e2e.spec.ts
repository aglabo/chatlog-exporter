// src: scripts/__tests__/e2e/prefilter-chatlog.main.e2e.spec.ts
// @(#): prefilter-chatlog main() の E2E テスト
//       main() 経由でのノイズフィルタリングフロー（実 tempdir・Deno.exit stub）
//
//       prefilter-chatlog の動作:
//         入力: inputDir/agent/YYYY/YYYY-MM/*.md
//         正規表現でノイズと判定したファイルを削除する
//         --dry-run: 削除せず対象パスを stdout に出力
//         --report:  NOISE\t{reason}\t{path} 形式で stdout に出力（削除なし）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../prefilter-chatlog.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// types
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { PREFILTER_MIN_CONTENT_LENGTH } from '../_helpers/constants.ts';
// e2e helpers
import { fileExists } from '../../../../_scripts/libs/file-io/exists-utils.ts';
import { assertFileExists, assertFileNotExists } from '../_helpers/chatlog-asserts.ts';
import { makeRepeatedContent, makeTestDirs } from '../_helpers/chatlog-fixtures.ts';

// ─── Internal Helpers

// functions

/** `_makeTestDirs` のラッパー。デフォルト引数付きで `makeTestDirs` を呼び出す。 */
const _makeTestDirs = (agent = 'claude', period = '2026-03') => makeTestDirs(agent, period);

/** `_makeValidContent` のラッパー。`PREFILTER_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = () => makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH);

// ─── Tests

// ─── T-PF-E2E-01: --dry-run → ファイル削除なし、パスが stdout に出力 ──────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（dry-run モード）。
 *
 * `--dry-run` フラグを指定した際にファイルが削除されず、
 * ノイズと判定されたファイルのパスが stdout に出力されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-01
 *
 * @see main
 */
describe('main (prefilter) - dry-run モード', () => {
  /**
   * ノイズファイル名（`say-ok-and-nothing-else.md`）の `.md` ファイルと
   * `--dry-run` フラグが存在する前提。
   *
   * dry-run 時にファイルが削除されず、パスがログに出力されることを確認する。
   */
  describe('Given: ノイズファイル名の .md ファイルと --dry-run フラグ', () => {
    /** `main(["claude", "--dry-run", "--input", tempDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--dry-run", "--input", tempDir]) を呼び出す', () => {
      /** ファイルが削除されず、stdout にノイズファイルのパスが出力されること。 */
      describe('Then: T-PF-E2E-01 - ファイルが削除されずパスが stdout に出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-01-01: ファイルが削除されずに残り、stdout にパスが出力される', async () => {
          const filePath = `${chatlogsDir}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, _makeValidContent());

          await main(['claude', '2026-03', '--dry-run', '--input', tempDir]);

          assertEquals(await fileExists(filePath), true);
          assertEquals(loggerStub.logLogs.some((line) => line.includes('say-ok-and-nothing-else.md')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-02: --report → NOISE\t{reason}\t{path} 形式、削除なし ──────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（report モード）。
 *
 * `--report` フラグを指定した際に `NOISE\t{reason}\t{path}` 形式で
 * stdout に出力され、ファイルが削除されないことを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-02
 *
 * @see main
 */
describe('main (prefilter) - report モード', () => {
  /**
   * ノイズファイル名の `.md` ファイルと `--report` フラグが存在する前提。
   *
   * report モードでは NOISE タブ区切り形式の出力が行われ、
   * ファイルの削除は発生しないことを確認する。
   */
  describe('Given: ノイズファイル名の .md ファイルと --report フラグ', () => {
    /** `main(["claude", "--report", "--input", tempDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--report", "--input", tempDir]) を呼び出す', () => {
      /** `NOISE\t{reason}\t{path}` 形式でログ出力され、ファイルが削除されないこと。 */
      describe('Then: T-PF-E2E-02 - NOISE タブ区切り形式で出力、削除なし', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-02-01: NOISE タブ区切り形式で出力され、ファイルが削除されずに残っている', async () => {
          const filePath = `${chatlogsDir}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, _makeValidContent());

          await main(['claude', '2026-03', '--report', '--input', tempDir]);

          const noiseLine = loggerStub.logLogs.find((line) => line.startsWith('NOISE\t'));
          assertEquals(noiseLine !== undefined, true);
          assertEquals(noiseLine!.split('\t').length >= 3, true);
          assertEquals(await fileExists(filePath), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-03: 通常実行 → ノイズファイルが削除される ─────────────────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（通常実行・削除あり）。
 *
 * ノイズと正常ファイルが混在する場合に、ノイズファイルのみが削除され
 * 正常ファイルが残ることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-03
 *
 * @see main
 */
describe('main (prefilter) - 通常実行（削除あり）', () => {
  /**
   * ノイズファイル（`say-ok-and-nothing-else.md`）と正常ファイル（`valid-chat.md`）が
   * 混在するディレクトリが存在する前提。
   *
   * 通常実行時にノイズファイルのみが削除され、正常ファイルは残ることを確認する。
   */
  describe('Given: ノイズと正常ファイルが混在するディレクトリ', () => {
    /** `main(["claude", "--input", tempDir])` を通常モードで呼び出すとき。 */
    describe('When: main(["claude", "--input", tempDir]) を呼び出す', () => {
      /** ノイズファイルが削除され、正常ファイルはファイルシステムに残ること。 */
      describe('Then: T-PF-E2E-03 - ノイズは削除、正常は残る', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-03-01: ノイズファイルが削除され、正常ファイルが残っている', async () => {
          const noisePath = `${chatlogsDir}/say-ok-and-nothing-else.md`;
          const validPath = `${chatlogsDir}/valid-chat.md`;
          await Deno.writeTextFile(noisePath, _makeValidContent());
          await Deno.writeTextFile(validPath, _makeValidContent());

          await main(['claude', '2026-03', '--input', tempDir]);

          await assertFileNotExists(noisePath);
          assertEquals(await fileExists(validPath), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-04: 正常ファイルのみ → 全件 keep ───────────────────────────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（全件 keep）。
 *
 * ノイズファイルが存在しない場合に全ファイルが keep となり、
 * 完了ログに `noise=0` が含まれることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-04
 *
 * @see main
 */
describe('main (prefilter) - 全件 keep', () => {
  /**
   * 正常ファイル 2 件のみが存在するディレクトリの前提。
   *
   * 全件 keep 時にファイルが削除されず、完了ログに `noise=0` が含まれることを確認する。
   */
  describe('Given: 正常ファイル 2 件', () => {
    /** `main(["claude", "--input", tempDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--input", tempDir]) を呼び出す', () => {
      /** 全ファイルが残り、完了ログに `noise=0` が含まれること。 */
      describe('Then: T-PF-E2E-04 - 全ファイルが残っており keep=2 のログ', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-04-01: 全ファイルが削除されずに残り、完了ログに "noise=0" が含まれる', async () => {
          const path1 = `${chatlogsDir}/valid-1.md`;
          const path2 = `${chatlogsDir}/valid-2.md`;
          await Deno.writeTextFile(path1, _makeValidContent());
          await Deno.writeTextFile(path2, _makeValidContent());

          await main(['claude', '2026-03', '--input', tempDir]);

          await assertFileExists(path1);
          await assertFileExists(path2);
          assertEquals(loggerStub.infoLogs.some((line) => line.includes('noise=0')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-06: 空ディレクトリ → noise=0 keep=0 ログ ──────────────────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（空ディレクトリ）。
 *
 * `.md` ファイルが 0 件の場合に `noise=0 keep=0 error=0` を含む
 * 完了ログが出力されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-06
 *
 * @see main
 */
describe('main (prefilter) - 空ディレクトリ', () => {
  /**
   * `.md` ファイルが存在しないエージェントディレクトリが存在する前提。
   *
   * 対象ファイルが 0 件の場合の完了ログが適切に出力されることを確認する。
   */
  describe('Given: .md ファイルが 0 件のディレクトリ', () => {
    /** `main(["claude", "--input", tempDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--input", tempDir]) を呼び出す', () => {
      /** 完了ログに `noise=0` と `keep=0` が含まれること。 */
      describe('Then: T-PF-E2E-06 - "noise=0 keep=0 error=0" を含むログが出力される', () => {
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

        it('T-PF-E2E-06-01: 完了ログに "noise=0 keep=0 error=0" が含まれる', async () => {
          await Deno.mkdir(`${tempDir}/claude`, { recursive: true });

          await main(['claude', '--input', tempDir]);

          assertEquals(loggerStub.infoLogs.some((line) => line.includes('noise=0') && line.includes('keep=0')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-07: period 絞り込み → 指定月のみ削除対象 ──────────────────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（period 絞り込み）。
 *
 * period を指定した場合に指定月のファイルのみが削除対象となり、
 * 他月のファイルは影響を受けないことを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-07
 *
 * @see main
 */
describe('main (prefilter) - period 絞り込み', () => {
  /**
   * 2026-03 と 2026-04 の両月にノイズファイルが存在する前提。
   *
   * period=2026-03 を指定した場合に 2026-03 のノイズファイルのみが削除され、
   * 2026-04 のファイルが残ることを確認する。
   */
  describe('Given: 2026-03 と 2026-04 両方にノイズファイル', () => {
    /** `main(["claude", "2026-03", "--input", tempDir])` を period 指定で呼び出すとき。 */
    describe('When: main(["claude", "2026-03", "--input", tempDir]) を呼び出す', () => {
      /** 指定月（2026-03）のファイルが削除され、他月（2026-04）が残ること。 */
      describe('Then: T-PF-E2E-07 - 2026-03 のみ削除され 2026-04 は残る', () => {
        let tempDir: string;
        let chatlogsDir03: string;
        let chatlogsDir04: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir: chatlogsDir03 } = await _makeTestDirs('claude', '2026-03'));
          chatlogsDir04 = `${tempDir}/claude/2026/2026-04`;
          await Deno.mkdir(chatlogsDir04, { recursive: true });
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-07-01: 2026-03 のノイズファイルが削除され、2026-04 のファイルは残っている', async () => {
          const noisePath03 = `${chatlogsDir03}/say-ok-and-nothing-else.md`;
          const noisePath04 = `${chatlogsDir04}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(noisePath03, _makeValidContent());
          await Deno.writeTextFile(noisePath04, _makeValidContent());

          await main(['claude', '2026-03', '--input', tempDir]);

          await assertFileNotExists(noisePath03);
          assertEquals(await fileExists(noisePath04), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-08: --report → 完了ログに "report" が含まれる ─────────────────

/**
 * `main` 関数（prefilter）の E2E テストスイート（report 完了ログ）。
 *
 * `--report` フラグを指定した際の完了ログに `report` が含まれることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-08
 *
 * @see main
 */
describe('main (prefilter) - report 完了ログ', () => {
  /**
   * 正常ファイル 1 件と `--report` フラグが存在する前提。
   *
   * report モードの完了ログが `report` キーワードを含むことを確認する。
   */
  describe('Given: 正常ファイル 1 件と --report フラグ', () => {
    /** `main(["claude", "--report", "--input", tempDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--report", "--input", tempDir]) を呼び出す', () => {
      /** 完了ログに `report` キーワードが含まれること。 */
      describe('Then: T-PF-E2E-08 - 完了ログに "report" が含まれる', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-08-01: 完了ログに "report" が含まれる', async () => {
          await Deno.writeTextFile(`${chatlogsDir}/valid.md`, _makeValidContent());

          await main(['claude', '2026-03', '--report', '--input', tempDir]);

          assertEquals(loggerStub.infoLogs.some((line) => line.includes('report')), true);
        });
      });
    });
  });
});
