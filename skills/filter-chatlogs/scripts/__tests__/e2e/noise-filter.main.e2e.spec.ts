// src: scripts/__tests__/e2e/noise-filter.main.e2e.spec.ts
// @(#): noise-filter-chatlogs main() の E2E テスト
//       main() 経由でのノイズフィルタリングフロー（実 tempdir・Deno.exit stub）
//
//       noise-filter-chatlogs の動作:
//         入力: inputDir/agent/YYYY/YYYY-MM/*.md
//         正規表現でノイズと判定したファイルを削除する
//         --dry-run: 削除せず対象パスを stdout に出力
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../noise-filter-chatlogs.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// types
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// constants
import { DEFAULT_ORIGINAL_LOGS_DIR } from '../../../../_scripts/constants/defaults.constants.ts';
// e2e helpers
import { assertFileExist, assertFileNotExist } from '../../../../_scripts/__tests__/helpers/assert.ts';
import { fileExists } from '../../../../_scripts/libs/file-ops/exists-utils.ts';
import { makePeriodDir, makeRepeatedContent, makeTestDirs, makeValidContent } from '../_helpers/fixtures.ts';
// helpers
import { resetProjectRoot } from '../../../../_scripts/libs/path-utils/dir-utils.ts';

// ─── Internal Helpers

// constants

/**
 * `main`（prefilterFiles → processNoiseFiles）を通過する最小テキスト長（文字数）。
 *
 * `main()` は `prefilterFiles` の `minCharCount`（デフォルト 1000）を経由するため、
 * `processNoiseFiles` 単体のテストで使う `NOISE_FILTER_MIN_CONTENT_LENGTH`（300）では
 * 事前フィルタで除外されてしまう。`makeRepeatedContent(N)` は本文長 `2N+46` 程度になるため、
 * N=500 で `minCharCount`（1000）と `minAssistantChars`（300）の両方を満たす。
 */
const _MAIN_MIN_CONTENT_LENGTH = 500;

// functions

/** `_makeTestDirs` のラッパー。デフォルト引数付きで `makeTestDirs` を呼び出す。 */
const _makeTestDirs = (agent = 'claude', period = '2026-03') => makeTestDirs(agent, period);

/** `_makeValidContent` のラッパー。`_MAIN_MIN_CONTENT_LENGTH` を固定して `makeRepeatedContent` を呼び出す。 */
const _makeValidContent = () => makeRepeatedContent(_MAIN_MIN_CONTENT_LENGTH);

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

// ─── Tests

// ─── T-PF-E2E-01: --dry-run → ファイル削除なし、パスが stdout に出力 ──────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（dry-run モード）。
 *
 * `--dry-run` フラグを指定した際にファイルが削除されず、
 * ノイズと判定されたファイルのパスが stdout に出力されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-01
 *
 * @see main
 */
describe('main (noise-filter) - dry-run モード', () => {
  /**
   * ノイズファイル名（`say-ok-and-nothing-else.md`）の `.md` ファイルと
   * `--dry-run` フラグが存在する前提。
   *
   * dry-run 時にファイルが削除されず、パスがログに出力されることを確認する。
   */
  describe('Given: ノイズファイル名の .md ファイルと --dry-run フラグ', () => {
    /** `main(["claude", "--dry-run", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--dry-run", "--input-dir", chatlogsDir]) を呼び出す', () => {
      /** ファイルが削除されず、info ログにノイズファイルのパスが出力されること。 */
      describe('Then: T-PF-E2E-01 - ファイルが削除されずパスが info ログに出力される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-01-01: ファイルが削除されずに残り、info ログにパスが出力される', async () => {
          const filePath = `${chatlogsDir}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(filePath, _makeValidContent());

          await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);

          assertEquals(await fileExists(filePath), true);
          assertEquals(loggerStub.infoLogs.some((line) => line.includes('say-ok-and-nothing-else.md')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-03: 通常実行 → ノイズファイルが削除される ─────────────────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（通常実行・削除あり）。
 *
 * ノイズと正常ファイルが混在する場合に、ノイズファイルのみが削除され
 * 正常ファイルが残ることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-03
 *
 * @see main
 */
describe('main (noise-filter) - 通常実行（削除あり）', () => {
  /**
   * ノイズファイル（`say-ok-and-nothing-else.md`）と正常ファイル（`valid-chat.md`）が
   * 混在するディレクトリが存在する前提。
   *
   * 通常実行時にノイズファイルのみが削除され、正常ファイルは残ることを確認する。
   */
  describe('Given: ノイズと正常ファイルが混在するディレクトリ', () => {
    /** `main(["claude", "--input-dir", chatlogsDir])` を通常モードで呼び出すとき。 */
    describe('When: main(["claude", "--input-dir", chatlogsDir]) を呼び出す', () => {
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
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-03-01: ノイズファイルが削除され、正常ファイルが残っている', async () => {
          const noisePath = `${chatlogsDir}/say-ok-and-nothing-else.md`;
          const validPath = `${chatlogsDir}/valid-chat.md`;
          await Deno.writeTextFile(noisePath, _makeValidContent());
          await Deno.writeTextFile(validPath, _makeValidContent());

          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          await assertFileNotExist(noisePath);
          assertEquals(await fileExists(validPath), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-16: 内容が短いファイル → 事前フィルタで削除される ─────────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（事前フィルタによる内容ベース削除）。
 *
 * ファイル名はノイズパターンに一致しないが本文が `minCharCount`（デフォルト 1000）未満の
 * ファイルが、`processNoiseFiles`（会話内容判定）に到達する前に `prefilterFiles` の
 * 内容チェックで削除されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-16
 *
 * @see main
 */
describe('main (noise-filter) - 事前フィルタによる内容ベース削除', () => {
  /**
   * ファイル名は正常だが本文が `minCharCount` 未満の短い会話ファイルが存在する前提。
   *
   * ファイル名パターンでは除外されないが、内容が短すぎるため事前フィルタで削除されることを確認する。
   */
  describe('Given: ファイル名は正常だが本文が短すぎるファイル', () => {
    /** `main(["claude", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--input-dir", chatlogsDir]) を呼び出す', () => {
      /** ファイルが `processNoiseFiles` に到達する前に事前フィルタで削除されること。 */
      describe('Then: T-PF-E2E-16 - 内容が短いファイルが事前フィルタで削除される', () => {
        let tempDir: string;
        let chatlogsDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          ({ tempDir, chatlogsDir } = await _makeTestDirs());
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-16-01: 本文が短すぎるファイルが削除される', async () => {
          const shortPath = `${chatlogsDir}/short-content.md`;
          // Assistant応答は100文字以上（processNoiseFiles 単体の MIN_ASSISTANT_CHARS を通過する）が、
          // 本文全体は minCharCount（デフォルト1000）未満のため、prefilterFiles で削除される想定。
          const question = 'これは通常の質問文です。'.repeat(3);
          const answer = 'これは通常の回答文です。'.repeat(15);
          await Deno.writeTextFile(shortPath, makeValidContent('テスト', question, answer));

          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          await assertFileNotExist(shortPath);
        });
      });
    });
  });
});

// ─── T-PF-E2E-04: 正常ファイルのみ → 全件 keep ───────────────────────────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（全件 keep）。
 *
 * ノイズファイルが存在しない場合に全ファイルが keep となり、
 * 完了ログに `keep=2` が含まれることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-04
 *
 * @see main
 */
describe('main (noise-filter) - 全件 keep', () => {
  /**
   * 正常ファイル 2 件のみが存在するディレクトリの前提。
   *
   * 全件 keep 時にファイルが削除されず、完了ログに `keep=2` が含まれることを確認する。
   */
  describe('Given: 正常ファイル 2 件', () => {
    /** `main(["claude", "--input-dir", chatlogsDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--input-dir", chatlogsDir]) を呼び出す', () => {
      /** 全ファイルが残り、完了ログに `keep=2` が含まれること。 */
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
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-04-01: 全ファイルが削除されずに残り、完了ログに "keep=2" が含まれる', async () => {
          const path1 = `${chatlogsDir}/valid-1.md`;
          const path2 = `${chatlogsDir}/valid-2.md`;
          await Deno.writeTextFile(path1, _makeValidContent());
          await Deno.writeTextFile(path2, _makeValidContent());

          await main(['claude', '2026-03', '--input-dir', chatlogsDir]);

          await assertFileExist(path1);
          await assertFileExist(path2);
          assertEquals(loggerStub.infoLogs.some((line) => line.includes('keep=2')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-06: 空ディレクトリ → keep=0 remove=0 error=0 ログ ─────────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（空ディレクトリ）。
 *
 * `.md` ファイルが 0 件の場合に `keep=0 remove=0 error=0` を含む
 * 完了ログが出力されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-06
 *
 * @see main
 */
describe('main (noise-filter) - 空ディレクトリ', () => {
  /**
   * `.md` ファイルが存在しないエージェントディレクトリが存在する前提。
   *
   * 対象ファイルが 0 件の場合の完了ログが適切に出力されることを確認する。
   */
  describe('Given: .md ファイルが 0 件のディレクトリ', () => {
    /** `main(["claude", "--input-dir", agentDir])` を呼び出すとき。 */
    describe('When: main(["claude", "--input-dir", agentDir]) を呼び出す', () => {
      /** 完了ログに `keep=0` と `remove=0` が含まれること。 */
      describe('Then: T-PF-E2E-06 - "keep=0 remove=0 error=0" を含むログが出力される', () => {
        let tempDir: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          tempDir = await Deno.makeTempDir();
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-06-01: 完了ログに "keep=0 remove=0 error=0" が含まれる', async () => {
          const agentDir = `${tempDir}/claude`;
          await Deno.mkdir(agentDir, { recursive: true });

          await main(['claude', '--input-dir', agentDir]);

          assertEquals(loggerStub.infoLogs.some((line) => line.includes('keep=0') && line.includes('remove=0')), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-07: period 絞り込み → 指定月のみ削除対象 ──────────────────────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（period 絞り込み）。
 *
 * period を指定した場合に指定月のファイルのみが削除対象となり、
 * 他月のファイルは影響を受けないことを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-07
 *
 * @see main
 */
describe('main (noise-filter) - period 絞り込み', () => {
  /**
   * 2026-03 と 2026-04 の両月にノイズファイルが存在する前提。
   *
   * period=2026-03 を指定した場合に 2026-03 のノイズファイルのみが削除され、
   * 2026-04 のファイルが残ることを確認する。
   */
  describe('Given: 2026-03 と 2026-04 両方にノイズファイル', () => {
    /** `main(["claude", "2026-03"])` を period 指定で呼び出すとき（GlobalConfig に chatlogsDir を設定）。 */
    describe('When: main(["claude", "2026-03"]) を呼び出す', () => {
      /** 指定月（2026-03）のファイルが削除され、他月（2026-04）が残ること。 */
      describe('Then: T-PF-E2E-07 - 2026-03 のみ削除され 2026-04 は残る', () => {
        let tempDir: string;
        let chatlogsDir03: string;
        let chatlogsDir04: string;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          let periodDir1: string;
          let periodDir2: string;
          ({ tempDir, periodDir1, periodDir2 } = await makePeriodDir(
            'claude',
            '2026-03',
            '2026-04',
          ));
          // 探索ディレクトリは GlobalConfig.chatlogsDir + originalLogs から解決されるため、
          // ノイズファイルは originalLogs 配下に作成する。
          chatlogsDir03 = periodDir1.replace(`${tempDir}/`, `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/`);
          chatlogsDir04 = periodDir2.replace(`${tempDir}/`, `${tempDir}/${DEFAULT_ORIGINAL_LOGS_DIR}/`);
          await Deno.mkdir(chatlogsDir03, { recursive: true });
          await Deno.mkdir(chatlogsDir04, { recursive: true });
          await _makeGlobalConfig(`chatlogsDir: '${tempDir}'`);
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(tempDir, { recursive: true });
        });

        it('T-PF-E2E-07-01: 2026-03 のノイズファイルが削除され、2026-04 のファイルは残っている', async () => {
          const noisePath03 = `${chatlogsDir03}/say-ok-and-nothing-else.md`;
          const noisePath04 = `${chatlogsDir04}/say-ok-and-nothing-else.md`;
          await Deno.writeTextFile(noisePath03, _makeValidContent());
          await Deno.writeTextFile(noisePath04, _makeValidContent());

          await main(['claude', '2026-03']);

          await assertFileNotExist(noisePath03);
          assertEquals(await fileExists(noisePath04), true);
        });
      });
    });
  });
});

// ─── T-PF-E2E-08: 存在しない inputDir → ChatlogError で reject される ───────

/**
 * `main` 関数（noise-filter）の E2E テストスイート（存在しない inputDir）。
 *
 * 入力ディレクトリが存在しない場合に `ChatlogError` が throw され、
 * `main` が reject されることを検証する。
 *
 * テスト ID 範囲: T-PF-E2E-08
 *
 * @see main
 */
describe('main (noise-filter) - 存在しない inputDir', () => {
  /**
   * 存在しないディレクトリパスを `--input-dir` に指定する前提。
   *
   * 入力ディレクトリが見つからない場合に `ChatlogError` が throw されることを確認する。
   */
  describe('Given: 存在しない inputDir を指定', () => {
    /** `main(["claude", "--input-dir", "/nonexistent/path"])` を呼び出すとき。 */
    describe('When: main(["claude", "--input-dir", "/nonexistent/path"]) を呼び出す', () => {
      /** `ChatlogError` が throw され `main` が reject されること。 */
      describe('Then: T-PF-E2E-08 - main が ChatlogError で reject される', () => {
        afterEach(() => {
          GlobalConfig.resetInstance();
        });

        it('T-PF-E2E-08-01: ChatlogError で main が reject される', async () => {
          await assertRejects(
            () => main(['claude', '--input-dir', '/nonexistent/path']),
            ChatlogError,
          );
        });

        it('T-PF-E2E-08-02: エラーメッセージにパスの詳細が含まれる', async () => {
          const error = await assertRejects(
            () => main(['claude', '--input-dir', '/nonexistent/path']),
            ChatlogError,
          );
          assertEquals(error.message.includes('/nonexistent/path'), true);
        });
      });
    });
  });
});
