// src: scripts/__tests__/system/filter/main.system.spec.ts
// @(#): filter-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証・in-process の戻り値検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../../filter-chatlogs.ts';

// ─── Helpers
// mocks
import { installCommandMock, makeCountingMock } from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// logger stub
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// path utils
import { resetProjectRoot } from '../../../../../_cle-libs/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';
// fixtures
import { makeTestDirs } from '../../_helpers/fixtures.ts';

// ─── Internal Helpers

// constants
const SCRIPT_PATH = normalizePath(new URL('../../../filter-chatlogs.ts', import.meta.url).pathname);

// functions
/**
 * filter-chatlogs をサブプロセスで起動し、終了コードのみを返す。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @returns 終了コード
 */
async function runFilter(args: string[]): Promise<number> {
  const { code } = await _runFilterWithStderr(args);
  return code;
}

/**
 * filter-chatlogs をサブプロセスで起動し、終了コードと stderr を返す。
 *
 * `--allow-env` は SKILL.md の本番起動と揃える（キャッシュ先 `${TEMP}` の展開に必要）。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @param env - サブプロセスに上書きで渡す環境変数（`TEMP` をテスト用一時ディレクトリへ向ける等）
 * @returns 終了コードと UTF-8 デコード済みの stderr
 */
async function _runFilterWithStderr(
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stderr: string }> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', '--allow-run', SCRIPT_PATH, ...args],
    env,
    stdout: 'null',
    stderr: 'piped',
  });
  const _output = await _cmd.output();
  return { code: _output.code, stderr: new TextDecoder().decode(_output.stderr) };
}

/**
 * 判定結果キャッシュの書き込み先を `<tempDir>/cache` に向けた `GlobalConfig` を初期化する。
 *
 * 実ユーザー環境の filter-cache を汚さないよう、`main()` を in-process で呼ぶ前に使う。
 *
 * @param tempDir - キャッシュを置く一時ディレクトリ
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
function _isolateCache(tempDir: string): GlobalConfig {
  resetProjectRoot('/home/user/project');
  GlobalConfig.resetInstance();
  return GlobalConfig.getInstance({
    readTextFileProvider: () => `cacheDir: '${tempDir}/cache'`,
    configFile: 'dummy.yaml',
  });
}

// ─── Tests

// ─── T-FL-SYS-01: 存在しない inputDir → exit(1) ──────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない inputDir を指定', () => {
    describe('When: filter-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-FL-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-FL-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runFilter(['claude', '--input-dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });

        it('[Error] T-FL-SYS-01-02: stderr に "入力ディレクトリが見つかりません" を含む', async () => {
          const { stderr } = await _runFilterWithStderr(['claude', '--input-dir', '/nonexistent/path']);
          assertStringIncludes(stderr, '入力ディレクトリが見つかりません');
        });
      });
    });
  });
});

// ─── T-FL-SYS-02: 不明なオプション → 整形済みエラーで exit(1) ─────────────────

describe('main - エントリポイントのエラー整形', () => {
  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: filter-chatlogs をサブプロセスで実行する', () => {
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        _result = await _runFilterWithStderr(['claude', '2026-08', '--unknown-option']);
      });

      describe('Then: T-FL-SYS-02 - スタックトレース無しのエラーメッセージで終了コード 1 になる', () => {
        it('[Error] T-FL-SYS-02-01: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1, `stderr:\n${_result.stderr}`);
        });

        it('[Error] T-FL-SYS-02-02: stderr に "不明なオプション" を含む', () => {
          assertStringIncludes(_result.stderr, '不明なオプション');
        });

        it('[Error] T-FL-SYS-02-03: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Error] T-FL-SYS-02-04: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-FL-SYS-06: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 対象ファイルが 0 件の chatlogsDir', () => {
    describe('When: --dry-run で filter-chatlogs をサブプロセスで実行する', () => {
      let tempDir: string;
      let chatlogsDir: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        ({ tempDir, chatlogsDir } = await makeTestDirs('claude', '2026-03'));
        // 判定結果キャッシュが実環境の TEMP ではなく tempDir 配下へ書かれるよう、
        // --config の cacheDir と TEMP / TMP の両方を tempDir に向ける
        const _configFile = `${tempDir}/config.yaml`;
        await Deno.writeTextFile(_configFile, `cacheDir: "${normalizePath(tempDir)}/cache"\n`);
        _result = await _runFilterWithStderr(
          ['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir, '--config', _configFile],
          { TEMP: tempDir, TMP: tempDir },
        );
      });

      afterAll(async () => {
        await Deno.remove(tempDir, { recursive: true });
      });

      describe('Then: T-FL-SYS-06 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-FL-SYS-06-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-FL-SYS-06-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-FL-SYS-03: 不明なオプション → main() が ChatlogError を throw ──────────

describe('main - in-process のエラー伝播', () => {
  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-FL-SYS-03 - main() が ChatlogError で reject する', () => {
        it('[Error] T-FL-SYS-03-01: "不明なオプション" を含む ChatlogError で reject する', async () => {
          await assertRejects(() => main(['--unknown-option']), ChatlogError, '不明なオプション');
        });
      });
    });
  });
});

// ─── T-FL-SYS-04: main() が終了コード 0 を返す ───────────────────────────────

describe('main - 正常終了の戻り値', () => {
  let tempDir: string;
  let chatlogsDir: string;
  let commandHandle: CommandMockHandle;
  let loggerStub: LoggerStub;
  let counter: { calls: number };

  beforeEach(async () => {
    ({ tempDir, chatlogsDir } = await makeTestDirs('claude', '2026-03'));
    // 判定結果キャッシュを tempDir 配下に隔離し、実ユーザー環境のキャッシュを汚さない
    _isolateCache(tempDir);
    // claude CLI を実際に起動しないよう Deno.Command を差し替える
    counter = { calls: 0 };
    commandHandle = installCommandMock(makeCountingMock('[]', counter));
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    commandHandle.restore();
    loggerStub.restore();
    GlobalConfig.resetInstance();
    resetProjectRoot();
    await Deno.remove(tempDir, { recursive: true });
  });

  describe('Given: 対象ファイルが 0 件の chatlogsDir', () => {
    describe('When: --dry-run で main() を in-process で呼ぶ', () => {
      describe('Then: T-FL-SYS-04 - 完了経路を通って 0 を返す', () => {
        it('[Normal] T-FL-SYS-04-01: 戻り値が 0 である', async () => {
          const _result = await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);
          assertEquals(_result, 0);
        });

        it('[Normal] T-FL-SYS-04-02: dry-run の完了サマリーが info ログに出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);
          assertStringIncludes(loggerStub.infoLogs.join('\n'), '完了 (dry-run): total=');
        });
      });
    });
  });

  // ─── T-FL-SYS-05: 読み込み失敗ファイルがあっても main() は 0 を返す ──────────

  describe('Given: frontmatter の YAML 構文が不正なファイルが 1 件ある chatlogsDir', () => {
    const _brokenContent = `---\ntitle: [unclosed\n---\n\n### User\nHello\n`;
    let brokenPath: string;

    beforeEach(async () => {
      brokenPath = `${chatlogsDir}/broken.md`;
      await Deno.writeTextFile(brokenPath, _brokenContent);
    });

    describe('When: --dry-run で main() を in-process で呼ぶ', () => {
      describe('Then: T-FL-SYS-05 - stats.error を計上しつつ 0 を返す', () => {
        it('[Edge] T-FL-SYS-05-01: error 計上があっても戻り値が 0 である', async () => {
          const _result = await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);
          assertEquals(_result, 0);
        });

        it('[Edge] T-FL-SYS-05-02: 完了サマリーの info ログに "error=1" を含む', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', chatlogsDir]);
          assertStringIncludes(loggerStub.infoLogs.join('\n'), 'error=1');
        });
      });
    });
  });
});
