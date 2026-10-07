// src: scripts/__tests__/system/classify-chatlogs.main.system.spec.ts
// @(#): classify-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../classify-chatlogs.ts';

// ─── Helpers
// mocks
import { installCommandMock, makeClaudeJsonMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// logger stub
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// classes
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';
// path utils
import { resetProjectRoot } from '../../../../_cle-libs/libs/path-utils/dir-utils.ts';
import { normalizePath } from '../../../../_cle-libs/libs/path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
const SCRIPT_PATH = normalizePath(new URL('../../classify-chatlogs.ts', import.meta.url).pathname);

// types
/** in-process 実行用に作成する一時ディレクトリ群。 */
interface _TestDirs {
  inputDir: string;
  configsDir: string;
  configFile: string;
  monthDir: string;
}

// functions
/**
 * classify-chatlogs をサブプロセスで起動し、終了コードのみを返す。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @returns 終了コード
 */
async function runClassify(args: string[]): Promise<number> {
  const { code } = await _runClassifyWithStderr(args);
  return code;
}

/**
 * classify-chatlogs をサブプロセスで起動し、終了コードと stderr を返す。
 *
 * `--allow-env` は SKILL.md の本番起動と揃える（キャッシュ先 `${TEMP}` の展開に必要）。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @param env - サブプロセスに上書きで渡す環境変数（`TEMP` をテスト用一時ディレクトリへ向ける等）
 * @returns 終了コードと UTF-8 デコード済みの stderr
 */
async function _runClassifyWithStderr(
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
 * inputDir / configsDir を作成して返す（e2e の `_makeTestDirs` と同構成）。
 * - configsDir/config.yaml: GlobalConfig 用の設定ファイル
 * - configsDir/projects.dic: テスト用プロジェクト辞書
 * - inputDir/originalLogs/claude/2026/2026-03/: 空の月別ディレクトリ
 *
 * @returns 作成した一時ディレクトリ群
 */
async function _makeTestDirs(): Promise<_TestDirs> {
  const inputDir = normalizePath(await Deno.makeTempDir());
  const configsDir = normalizePath(await Deno.makeTempDir());
  const configFile = `${configsDir}/config.yaml`;
  const monthDir = `${inputDir}/originalLogs/claude/2026/2026-03`;
  await Deno.mkdir(monthDir, { recursive: true });
  await Deno.writeTextFile(
    configFile,
    `dicsDir: "${configsDir}"\nprojectsDic: "${configsDir}/projects.dic"\ncacheDir: "${configsDir}/cache"\n`,
  );
  await Deno.writeTextFile(
    `${configsDir}/projects.dic`,
    'app1:\n  def: Test project 1\napp2:\n  def: Test project 2\n',
  );
  return { inputDir, configsDir, configFile, monthDir };
}

// ─── Tests

// ─── T-CL-SYS-01: エラー時に exit(1) で終了する ──────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 不正なオプションを指定', () => {
    describe('When: classify-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-CL-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-CL-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runClassify(['--unknown-option']);
          assertEquals(code, 1);
        });
      });
    });
  });
});

// ─── T-CL-SYS-06: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 分類対象の .md が 0 件の月ディレクトリ', () => {
    describe('When: --dry-run で classify-chatlogs をサブプロセスで実行する', () => {
      let dirs: _TestDirs;
      let tempRoot: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        dirs = await _makeTestDirs();
        // キャッシュ等が実環境の TEMP ではなく一時ディレクトリへ書かれるよう TEMP / TMP を差し替える
        tempRoot = await Deno.makeTempDir();
        _result = await _runClassifyWithStderr(
          ['claude', '2026-03', '--dry-run', '--input-dir', dirs.monthDir, '--config', dirs.configFile],
          { TEMP: tempRoot, TMP: tempRoot },
        );
      });

      afterAll(async () => {
        await Deno.remove(dirs.inputDir, { recursive: true });
        await Deno.remove(dirs.configsDir, { recursive: true });
        await Deno.remove(tempRoot, { recursive: true });
      });

      describe('Then: T-CL-SYS-06 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-CL-SYS-06-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-CL-SYS-06-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-CL-SYS-03: 不明なオプション → 整形済みエラーで exit(1) ─────────────────

describe('main - エントリポイントのエラー整形', () => {
  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: classify-chatlogs をサブプロセスで実行する', () => {
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        _result = await _runClassifyWithStderr(['--unknown-option']);
      });

      describe('Then: T-CL-SYS-03 - スタックトレース無しのエラーメッセージで終了コード 1 になる', () => {
        it('[Error] T-CL-SYS-03-01: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1);
        });

        it('[Error] T-CL-SYS-03-02: stderr に "不明なオプション" を含む', () => {
          assertStringIncludes(_result.stderr, '不明なオプション');
        });

        it('[Error] T-CL-SYS-03-03: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Error] T-CL-SYS-03-04: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-CL-SYS-04: 不明なオプション → main() が ChatlogError を throw ──────────

describe('main - in-process のエラー伝播', () => {
  describe('Given: 不明なオプション --unknown-option を指定', () => {
    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-CL-SYS-04 - main() が ChatlogError で reject する', () => {
        it('[Error] T-CL-SYS-04-01: "不明なオプション" を含む ChatlogError で reject する', async () => {
          await assertRejects(() => main(['--unknown-option']), ChatlogError, '不明なオプション');
        });
      });
    });
  });
});

// ─── T-CL-SYS-05: main() が終了コード 0 を返す ───────────────────────────────

describe('main - 正常終了の戻り値', () => {
  let dirs: _TestDirs;
  let commandHandle: CommandMockHandle;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    dirs = await _makeTestDirs();
    resetProjectRoot(dirs.inputDir);
    commandHandle = installCommandMock(
      makeClaudeJsonMock(
        JSON.stringify([{ file: 'chat.md', project: 'app1', confidence: 0.9, reason: 'matched' }]),
      ),
    );
    loggerStub = makeLoggerStub();
    GlobalConfig.resetInstance();
  });

  afterEach(async () => {
    commandHandle.restore();
    resetProjectRoot();
    loggerStub.restore();
    GlobalConfig.resetInstance();
    await Deno.remove(dirs.inputDir, { recursive: true });
    await Deno.remove(dirs.configsDir, { recursive: true });
  });

  describe('Given: 分類対象の .md が 0 件の月ディレクトリ', () => {
    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-CL-SYS-05 - 早期 return 経路で 0 を返す', () => {
        it('[Edge] T-CL-SYS-05-01: 戻り値が 0 である', async () => {
          const _result = await main(['claude', '2026-03', '--input-dir', dirs.monthDir, '--config', dirs.configFile]);
          assertEquals(_result, 0);
        });
      });
    });
  });

  describe('Given: 1 件の .md と claude モック', () => {
    beforeEach(async () => {
      await Deno.writeTextFile(`${dirs.monthDir}/chat.md`, '---\ntitle: テスト\ncategory: development\n---\n本文');
    });

    describe('When: --dry-run で main() を in-process で呼ぶ', () => {
      describe('Then: T-CL-SYS-05 - 通常完了経路で 0 を返す', () => {
        it('[Normal] T-CL-SYS-05-02: 戻り値が 0 である', async () => {
          const _result = await main([
            'claude',
            '2026-03',
            '--dry-run',
            '--input-dir',
            dirs.monthDir,
            '--config',
            dirs.configFile,
          ]);
          assertEquals(_result, 0);
        });

        it('[Normal] T-CL-SYS-05-03: dry-run の完了サマリーが info ログに出力される', async () => {
          await main(['claude', '2026-03', '--dry-run', '--input-dir', dirs.monthDir, '--config', dirs.configFile]);
          assertStringIncludes(loggerStub.infoLogs.join('\n'), '完了 (dry-run): moved=');
        });
      });
    });
  });
});
