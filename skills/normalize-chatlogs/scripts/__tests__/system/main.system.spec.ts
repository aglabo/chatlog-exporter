// src: scripts/__tests__/system/normalize-chatlogs.main.system.spec.ts
// @(#): normalize-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../normalize-chatlogs.ts';

// ─── Helpers
import { ChatlogError } from '../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';

// ─── Internal Helpers

// constants
const SCRIPT_PATH = new URL('../../normalize-chatlogs.ts', import.meta.url).pathname;

// functions
/**
 * テスト用 `GlobalConfig` インスタンスを `cacheDir` 指定の YAML で生成する。
 *
 * `GlobalConfig.resetInstance()` 済みであることを前提に、in-process の `main()` が作る
 * `normalize-cache` を実環境の `${TEMP}/cle-cache` ではなく `tempDir` 配下に隔離する。
 *
 * @param tempDir - キャッシュディレクトリの起点となる一時ディレクトリパス
 * @returns `cacheDir` を `${tempDir}/cache` に設定した `GlobalConfig`
 */
const _makeGlobalConfig = (tempDir: string): GlobalConfig =>
  GlobalConfig.getInstance({ yaml: `cacheDir: '${tempDir}/cache'` });

/**
 * normalize-chatlogs をサブプロセスで起動し、終了コードのみを返す。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @returns 終了コード
 */
async function runNormalize(args: string[]): Promise<number> {
  const { code } = await _runNormalizeWithStderr(args);
  return code;
}

/**
 * normalize-chatlogs をサブプロセスで起動し、終了コードと stderr を返す。
 *
 * `--allow-env` は SKILL.md の本番起動と揃える（キャッシュ先 `${TEMP}` の展開に必要）。
 *
 * @param args - スクリプトに渡す CLI 引数
 * @param env - サブプロセスに上書きで渡す環境変数（`TEMP` をテスト用一時ディレクトリへ向ける等）
 * @returns 終了コードと UTF-8 デコード済みの stderr
 */
async function _runNormalizeWithStderr(
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

// ─── T-NC-SYS-01: 存在しない --dir パス → exit(1) ────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない --dir パスを指定', () => {
    describe('When: normalize-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-NC-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-NC-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runNormalize(['--dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });
      });
    });
  });
});

// ─── T-NC-SYS-03: 正常終了時に main() が 0 を返す ─────────────────────────────

describe('main - 正常終了の戻り値', () => {
  describe('Given: 空の入力ディレクトリと出力ディレクトリ', () => {
    let inputDir: string;
    let outputDir: string;

    beforeEach(async () => {
      inputDir = await Deno.makeTempDir();
      outputDir = await Deno.makeTempDir();
      // キャッシュ（`normalize-cache`）を実環境の TEMP ではなく outputDir 配下へ書かせる
      GlobalConfig.resetInstance();
      _makeGlobalConfig(outputDir);
    });

    afterEach(async () => {
      GlobalConfig.resetInstance();
      await Deno.remove(inputDir, { recursive: true });
      await Deno.remove(outputDir, { recursive: true });
    });

    describe('When: --dry-run で main() を in-process で呼ぶ', () => {
      describe('Then: T-NC-SYS-03 - main() が終了コード 0 を返す', () => {
        it('[Normal] T-NC-SYS-03-01: 戻り値が 0 である', async () => {
          const _result = await main(['--input-dir', inputDir, '--output-dir', outputDir, '--dry-run']);
          assertEquals(_result, 0);
        });

        it('[Normal] T-NC-SYS-03-02: キャッシュが ${outputDir}/cache/normalize-cache に作られる', async () => {
          await main(['--input-dir', inputDir, '--output-dir', outputDir, '--dry-run']);
          const _cacheStat = await Deno.stat(`${outputDir}/cache/normalize-cache`);
          assertEquals(_cacheStat.isDirectory, true);
        });
      });
    });
  });
});

// ─── T-NC-SYS-05: 正常終了時にプロセスが exit(0) で終わる ──────────────────────

describe('main - エントリポイントの正常終了コード', () => {
  describe('Given: 空の入力ディレクトリと出力ディレクトリ', () => {
    describe('When: --dry-run で normalize-chatlogs をサブプロセスで実行する', () => {
      let inputDir: string;
      let outputDir: string;
      let tempRoot: string;
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        inputDir = await Deno.makeTempDir();
        outputDir = await Deno.makeTempDir();
        // キャッシュ（`${TEMP}/cle-cache`）を実環境の TEMP ではなく一時ディレクトリへ書かせる
        tempRoot = await Deno.makeTempDir();
        _result = await _runNormalizeWithStderr(
          ['--input-dir', inputDir, '--output-dir', outputDir, '--dry-run'],
          { TEMP: tempRoot, TMP: tempRoot },
        );
      });

      afterAll(async () => {
        await Deno.remove(inputDir, { recursive: true });
        await Deno.remove(outputDir, { recursive: true });
        await Deno.remove(tempRoot, { recursive: true });
      });

      describe('Then: T-NC-SYS-05 - main() の戻り値 0 がプロセスの終了コードになる', () => {
        it('[Normal] T-NC-SYS-05-01: 終了コードが 0 である', () => {
          assertEquals(_result.code, 0, `stderr:\n${_result.stderr}`);
        });

        it('[Normal] T-NC-SYS-05-02: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-NC-SYS-02: 範囲外オプション → 整形済みエラーで exit(1) ──────────────────

describe('main - エントリポイントのエラー整形', () => {
  describe('Given: --batch-size に下限未満の 0 を指定', () => {
    describe('When: normalize-chatlogs をサブプロセスで実行する', () => {
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        _result = await _runNormalizeWithStderr(['claude', '2026-08', '--batch-size', '0', '--dry-run']);
      });

      describe('Then: T-NC-SYS-02 - スタックトレース無しのエラーメッセージで終了コード 1 になる', () => {
        it('[Error] T-NC-SYS-02-01: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1);
        });

        it('[Error] T-NC-SYS-02-02: stderr に "範囲外の値です" を含む', () => {
          assertStringIncludes(_result.stderr, '範囲外の値です');
        });

        it('[Error] T-NC-SYS-02-03: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Error] T-NC-SYS-02-04: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });

  describe('Given: --batch-size に上限超過の 11 (max+1) を指定', () => {
    describe('When: normalize-chatlogs をサブプロセスで実行する', () => {
      let _result: { code: number; stderr: string };

      beforeAll(async () => {
        _result = await _runNormalizeWithStderr(['claude', '2026-08', '--batch-size', '11', '--dry-run']);
      });

      describe('Then: T-NC-SYS-02 - 上限側でも未捕捉例外にならない', () => {
        it('[Edge] T-NC-SYS-02-05: stderr に "Uncaught" を含まない', () => {
          assertEquals(_result.stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${_result.stderr}`);
        });

        it('[Edge] T-NC-SYS-02-06: 終了コードが 1 である', () => {
          assertEquals(_result.code, 1);
        });

        it('[Edge] T-NC-SYS-02-07: stderr に "範囲外の値です" を含む', () => {
          assertStringIncludes(_result.stderr, '範囲外の値です');
        });

        it('[Edge] T-NC-SYS-02-08: stderr に行頭 "    at " のスタック行を含まない', () => {
          assertEquals(/^ {4}at /m.test(_result.stderr), false, `stderr contains stack trace:\n${_result.stderr}`);
        });
      });
    });
  });
});

// ─── T-NC-SYS-04: 範囲外オプション → main() が ChatlogError を throw ──────────

describe('main - in-process のエラー伝播', () => {
  describe('Given: --batch-size に下限未満の 0 を指定', () => {
    describe('When: main() を in-process で呼ぶ', () => {
      describe('Then: T-NC-SYS-04 - main() が ChatlogError で reject する', () => {
        it('[Error] T-NC-SYS-04-01: "範囲外の値です" を含む ChatlogError で reject する', async () => {
          await assertRejects(
            () => main(['claude', '2026-08', '--batch-size', '0', '--dry-run']),
            ChatlogError,
            '範囲外の値です',
          );
        });
      });
    });
  });
});
