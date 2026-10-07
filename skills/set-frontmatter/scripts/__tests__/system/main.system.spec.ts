// src: scripts/__tests__/system/main.system.spec.ts
// @(#): set-frontmatter main() のシステムテスト（実プロセス起動による終了コード検証・in-process の戻り値検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../set-frontmatter.ts';

// ─── Helpers
// mocks
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { useDefaultGlobalConfig } from '../../../../_cle-libs/__tests__/helpers/global-config-setup.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
// path utils
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';
// fixtures
import { makeDicsDir, makeTargetDir } from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';

// ─── Internal Helpers

// constants
const SCRIPT_PATH = normalizePath(new URL('../../set-frontmatter.ts', import.meta.url).pathname);

// functions
/**
 * set-frontmatter をサブプロセスで起動し、終了コードのみを返す。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @returns 終了コード
 */
async function runSetFrontmatter(args: string[]): Promise<number> {
  const { code } = await _runSetFrontmatterWithStderr(args);
  return code;
}

/**
 * set-frontmatter をサブプロセスで起動し、終了コードと stderr を返す。
 *
 * `--allow-env` は SKILL.md の本番起動と揃える（キャッシュ先 `${TEMP}` の展開に必要）。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @param env - サブプロセスに上書きで渡す環境変数（`TEMP` をテスト用一時ディレクトリへ向ける等）
 * @returns 終了コードと UTF-8 デコード済みの stderr
 */
async function _runSetFrontmatterWithStderr(
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

// ─── Tests

// ─── T-SF-SYS-01: 存在しない inputDir → exit(1) ─────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない inputDir を指定', () => {
    describe('When: set-frontmatter をサブプロセスで実行する', () => {
      describe('Then: T-SF-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-SF-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runSetFrontmatter(['--input-dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });

        it('[Error] T-SF-SYS-01-02: stderr に "ディレクトリが見つかりません" を含む', async () => {
          const { stderr } = await _runSetFrontmatterWithStderr(['--input-dir', '/nonexistent/path']);
          assertStringIncludes(stderr, 'ディレクトリが見つかりません');
        });
      });
    });
  });
});

// ─── T-SF-SYS-02: 不明なオプション → 整形済みエラーで exit(1) ─────────────────

describe('main - エントリポイントのエラー整形', () => {
  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: set-frontmatter をサブプロセスで実行する', () => {
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        _result = await _runSetFrontmatterWithStderr(['claude', '2026-08', '--unknown-option']);
      });

      describe('Then: T-SF-SYS-02 - スタックトレース無しのエラーメッセージで終了コード 1 になる', () => {
        it('[Error] T-SF-SYS-02-01: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1, `stderr:\n${_result.stderr}`);
        });

        it('[Error] T-SF-SYS-02-02: stderr に "不明なオプション" を含む', () => {
          assertStringIncludes(_result.stderr, '不明なオプション');
        });

        it('[Error] T-SF-SYS-02-03: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Error] T-SF-SYS-02-04: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-SF-SYS-06: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 対象ファイルが 0 件の inputDir', () => {
    describe('When: set-frontmatter をサブプロセスで実行する', () => {
      let tempDir: string;
      let dicsDir: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        tempDir = await Deno.makeTempDir();
        dicsDir = await makeDicsDir();
        const _inputDir = `${tempDir}/input`;
        await Deno.mkdir(_inputDir);
        // GlobalConfig・キャッシュ・出力先がすべて tempDir 配下へ向くよう、
        // --config / --cache-dir / --output-dir / --dics と TEMP / TMP を tempDir に向ける
        const _configFile = `${tempDir}/config.yaml`;
        await Deno.writeTextFile(_configFile, `cacheDir: "${normalizePath(tempDir)}/cache"\n`);
        _result = await _runSetFrontmatterWithStderr(
          [
            '--input-dir',
            _inputDir,
            '--output-dir',
            `${tempDir}/output`,
            '--cache-dir',
            `${tempDir}/cache`,
            '--dics',
            dicsDir,
            '--config',
            _configFile,
          ],
          { TEMP: tempDir, TMP: tempDir },
        );
      });

      afterAll(async () => {
        await Deno.remove(tempDir, { recursive: true });
        // dicsDir は baseDir/dics なので親ディレクトリを削除
        await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true });
      });

      describe('Then: T-SF-SYS-06 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-SF-SYS-06-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-SF-SYS-06-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-SF-SYS-03: 不明なオプション → main() が ChatlogError を throw ──────────

describe('main - in-process のエラー伝播', () => {
  useDefaultGlobalConfig();

  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-SF-SYS-03 - main() が ChatlogError で reject する', () => {
        it('[Error] T-SF-SYS-03-01: "不明なオプション" を含む ChatlogError で reject する', async () => {
          await assertRejects(() => main(['--unknown-option']), ChatlogError, '不明なオプション');
        });
      });
    });
  });
});

// ─── T-SF-SYS-04 / 05: main() が終了コード 0 を返す ──────────────────────────

describe('main - 正常終了の戻り値', () => {
  // ローカルの config.yaml を読ませず、GlobalConfig を既定値で作り直す
  useDefaultGlobalConfig();

  let inputDir: string;
  let outputDir: string;
  let cacheDir: string;
  let dicsDir: string;
  let commandHandle: CommandMockHandle;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    outputDir = await Deno.makeTempDir();
    // キャッシュを tempDir に隔離し、実ユーザー環境の fm-cache を汚さない
    cacheDir = await Deno.makeTempDir();
    dicsDir = await makeDicsDir();
    // claude CLI を実際に起動しないよう Deno.Command を差し替える
    commandHandle = installCommandMock(
      makeClaudeJsonMock(['research', 'development', 'title: テスト', 'validity: pass'].join('\n'), { value: [] }),
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

  // ─── T-SF-SYS-04: 対象ファイル 0 件 → 早期 return で 0 ─────────────────────

  describe('Given: 対象ファイルが 0 件の inputDir', () => {
    beforeEach(async () => {
      inputDir = await Deno.makeTempDir();
    });

    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-SF-SYS-04 - 早期 return 経路を通って 0 を返す', () => {
        it('[Edge] T-SF-SYS-04-01: 戻り値が 0 である', async () => {
          const _result = await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--dics',
            dicsDir,
          ]);
          assertEquals(_result, 0);
        });

        it('[Edge] T-SF-SYS-04-02: "対象ファイルなし" が info ログに出力される', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir, '--cache-dir', cacheDir, '--dics', dicsDir]);
          assertStringIncludes(loggerStub.infoLogs.join('\n'), '対象ファイルなし');
        });
      });
    });
  });

  // ─── T-SF-SYS-05: 有効な .md 1 件 + --dry-run → 通常完了で 0 ───────────────

  describe('Given: 有効な .md ファイルが 1 件ある inputDir', () => {
    beforeEach(async () => {
      inputDir = await makeTargetDir();
    });

    describe('When: --dry-run --no-review で main() を in-process で呼ぶ', () => {
      describe('Then: T-SF-SYS-05 - 通常完了経路を通って 0 を返す', () => {
        it('[Normal] T-SF-SYS-05-01: 戻り値が 0 である', async () => {
          const _result = await main([
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
          assertEquals(_result, 0);
        });

        it('[Normal] T-SF-SYS-05-02: "dry-run 集計:" が info ログに出力される', async () => {
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
          assertStringIncludes(loggerStub.infoLogs.join('\n'), 'dry-run 集計:');
        });
      });
    });
  });
});
