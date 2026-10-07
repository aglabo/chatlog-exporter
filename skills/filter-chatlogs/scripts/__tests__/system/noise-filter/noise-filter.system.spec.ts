// src: scripts/__tests__/system/noise-filter/noise-filter.system.spec.ts
// @(#): noise-filter-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証・in-process の戻り値検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../../noise-filter-chatlogs.ts';

// ─── Helpers
// logger stub
import { makeLoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
// classes
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// path utils
import { normalizePath } from '../../../../../_cle-libs/libs/path-utils/path-utils.ts';

// ─── Internal Helpers

// constants
const SCRIPT_PATH = normalizePath(new URL('../../../noise-filter-chatlogs.ts', import.meta.url).pathname);

/** SKILL.md の本番起動と同じ権限。 */
const _DEFAULT_PERMISSIONS = ['--allow-read', '--allow-write', '--allow-run'];

// functions
/**
 * noise-filter-chatlogs をサブプロセスで起動し、終了コードと stderr を返す。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @param permissions - `deno run` に渡す権限フラグ（省略時は本番起動と同じ権限）
 * @returns 終了コードと UTF-8 デコード済みの stderr
 */
const runNoiseFilter = async (
  args: string[],
  permissions: string[] = _DEFAULT_PERMISSIONS,
): Promise<{ code: number; stderr: string }> => {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', ...permissions, SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'piped',
  });
  const _output = await _cmd.output();
  return { code: _output.code, stderr: new TextDecoder().decode(_output.stderr) };
};

/**
 * 空の入力ディレクトリと、実環境の設定を読まないための設定ファイルを tempDir 配下に作る。
 *
 * @returns 一時ディレクトリ・空の入力ディレクトリ・設定ファイルのパス
 */
const _makeEmptyInput = async (): Promise<{ tempDir: string; inputDir: string; configFile: string }> => {
  const tempDir = normalizePath(await Deno.makeTempDir());
  const inputDir = `${tempDir}/input`;
  await Deno.mkdir(inputDir, { recursive: true });
  const configFile = `${tempDir}/config.yaml`;
  await Deno.writeTextFile(configFile, `cacheDir: "${tempDir}/cache"\n`);
  return { tempDir, inputDir, configFile };
};

// ─── Tests

// ─── T-PF-SYS-01: 存在しない inputDir → exit(1) ──────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない inputDir を指定', () => {
    describe('When: noise-filter-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-PF-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-PF-SYS-01-01: 終了コードが 1 である', async () => {
          const { code } = await runNoiseFilter(['claude', '--input-dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });
      });
    });
  });
});

// ─── T-PF-SYS-02: main() が終了コード 0 を返す ───────────────────────────────

describe('main - 正常終了の戻り値', () => {
  let tempDir: string;
  let inputDir: string;
  let configFile: string;
  let loggerStub: LoggerStub;

  beforeEach(async () => {
    ({ tempDir, inputDir, configFile } = await _makeEmptyInput());
    // --config で渡す設定ファイルが読まれるよう、シングルトンを初期化前の状態に戻す
    GlobalConfig.resetInstance();
    loggerStub = makeLoggerStub();
  });

  afterEach(async () => {
    loggerStub.restore();
    GlobalConfig.resetInstance();
    await Deno.remove(tempDir, { recursive: true });
  });

  describe('Given: 対象ファイルが 0 件の inputDir', () => {
    describe('When: --dry-run で main() を in-process で呼ぶ', () => {
      describe('Then: T-PF-SYS-02 - 完了経路を通って 0 を返す', () => {
        it('[Normal] T-PF-SYS-02-01: 戻り値が 0 である', async () => {
          // 戻り値の型が void のままでも型検査で全件が止まらないよう、unknown で受けて実行時に検証する
          const _result = await main(['claude', '--input-dir', inputDir, '--dry-run', '--config', configFile]);
          assertEquals(_result, 0);
        });
      });
    });
  });
});

// ─── T-PF-SYS-03: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 対象ファイルが 0 件の inputDir', () => {
    describe('When: --dry-run で noise-filter-chatlogs をサブプロセスで実行する', () => {
      let tempDir: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        let inputDir: string;
        let configFile: string;
        ({ tempDir, inputDir, configFile } = await _makeEmptyInput());
        _result = await runNoiseFilter(['claude', '--input-dir', inputDir, '--dry-run', '--config', configFile]);
      });

      afterAll(async () => {
        await Deno.remove(tempDir, { recursive: true });
      });

      describe('Then: T-PF-SYS-03 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-PF-SYS-03-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-PF-SYS-03-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-PF-SYS-04: ChatlogError 以外の例外 → 整形済みエラーで exit(1) ─────────

describe('main - エントリポイントのエラー整形', () => {
  describe('Given: --allow-read を外して起動し、設定ファイル読み込みで NotCapable が発生する', () => {
    describe('When: noise-filter-chatlogs をサブプロセスで実行する', () => {
      let tempDir: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        let inputDir: string;
        ({ tempDir, inputDir } = await _makeEmptyInput());
        // 読み取り権限が無いため GlobalConfig の設定ファイル読み込みが
        // Deno.errors.NotCapable（ChatlogError ではない）を throw する
        _result = await runNoiseFilter(['claude', '--input-dir', inputDir, '--dry-run'], ['--allow-write']);
      });

      afterAll(async () => {
        await Deno.remove(tempDir, { recursive: true });
      });

      describe('Then: T-PF-SYS-04 - スタックトレース無しのエラーメッセージで終了コード 1 になる', () => {
        it('[Error] T-PF-SYS-04-01: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1, `stderr:\n${_result.stderr}`);
        });

        it('[Error] T-PF-SYS-04-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Error] T-PF-SYS-04-03: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });
});
