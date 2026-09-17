// src: scripts/__tests__/system/export-chatlogs.main.system.spec.ts
// @(#): export-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

/** テスト対象スクリプト `export-chatlogs.ts` への絶対パス。サブプロセス起動時の引数として使用する。 */
const SCRIPT_PATH = new URL('../../export-chatlogs.ts', import.meta.url).pathname;

/**
 * `export-chatlogs.ts` を Deno サブプロセスとして起動し、終了コードを返す。
 * システムテストで実際のプロセス終了コードを検証するために使用する。
 */
async function runExport(args: string[]): Promise<number> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
}

/**
 * `export-chatlogs.ts` を Deno サブプロセスとして起動し、終了コードと stderr を返す。
 * CLI エントリがエラーを `::error::` 形式で出力することを検証するために使用する。
 */
async function _runExportWithStderr(args: string[]): Promise<{ code: number; stderr: string }> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'piped',
  });
  const _output = await _cmd.output();
  return { code: _output.code, stderr: new TextDecoder().decode(_output.stderr) };
}

// ─── T-EC-SYS-01: 不明なオプション → exit(1) ─────────────────────────────────

/**
 * `main` 関数のシステムテストスイート（実プロセス起動）。
 *
 * export-chatlogs をサブプロセスとして起動し、終了コードを検証する。
 * 不明なオプション指定時に exit(1) で終了することをカバーする。
 *
 * @see main
 */
describe('main - エラー終了コード', () => {
  /**
   * 不明なオプション指定で exit(1) になるシナリオ。
   * parseArgs がエラーをスローしたとき、main がそれを catch して
   * exit(1) で終了することをサブプロセス起動で確認する。
   */
  describe('Given: 不明なオプション "--unknown-flag" を指定', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-01: プロセスが終了コード 1 で終了する */
      describe('Then: T-EC-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-EC-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runExport(['claude', '--unknown-flag']);
          assertEquals(code, 1);
        });
      });
    });
  });

  /**
   * ChatlogError がスローされるシナリオ。
   * CLI エントリが例外を捕捉し、`::error::` 付きメッセージを出して exit(1) することを確認する。
   */
  describe('Given: chatgpt エージェントに入力ディレクトリを指定しない', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-02: ChatlogError を捕捉して ::error:: を出力し exit(1) する */
      describe('Then: T-EC-SYS-02 - ChatlogError を ::error:: として出力し終了コード 1 で終了する', () => {
        it('[Error] T-EC-SYS-02-01: exit 1、stderr に ::error:: Invalid Args を含み Uncaught を含まない', async () => {
          const { code, stderr } = await _runExportWithStderr(['chatgpt']);

          assertEquals(code, 1);
          assertStringIncludes(
            stderr,
            '::error:: Invalid Args: chatgpt エージェントには入力ディレクトリを指定してください',
          );
          assertEquals(stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${stderr}`);
        });
      });
    });
  });

  /**
   * ChatlogError 以外の Error (NotADirectory) がスローされるシナリオ。
   * CLI エントリが再スローせずに `::error::` を出して exit(1) することを確認する。
   */
  describe('Given: --input-dir に通常ファイルを指定', () => {
    /** export-chatlogs をサブプロセスで実行する */
    describe('When: export-chatlogs をサブプロセスで実行する', () => {
      /** T-EC-SYS-03: ChatlogError 以外の Error も捕捉して exit(1) する */
      describe('Then: T-EC-SYS-03 - ChatlogError 以外の Error も ::error:: として出力し終了コード 1 で終了する', () => {
        it('[Error] T-EC-SYS-03-01: exit 1、stderr に ::error:: と readdir を含み Uncaught を含まない', async () => {
          const tmpFile = await Deno.makeTempFile();
          try {
            const { code, stderr } = await _runExportWithStderr(['chatgpt', '--input-dir', tmpFile]);

            assertEquals(code, 1);
            assertStringIncludes(stderr, '::error::');
            assertStringIncludes(stderr, 'readdir');
            assertEquals(stderr.includes('Uncaught'), false, `stderr contains Uncaught:\n${stderr}`);
          } finally {
            await Deno.remove(tmpFile);
          }
        });
      });
    });
  });
});
