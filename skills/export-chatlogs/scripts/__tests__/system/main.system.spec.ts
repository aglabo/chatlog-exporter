// src: scripts/__tests__/system/export-chatlog.main.system.spec.ts
// @(#): export-chatlog main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

/** テスト対象スクリプト `export-chatlog.ts` への絶対パス。サブプロセス起動時の引数として使用する。 */
const SCRIPT_PATH = new URL('../../export-chatlog.ts', import.meta.url).pathname;

/**
 * `export-chatlog.ts` を Deno サブプロセスとして起動し、終了コードを返す。
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

// ─── T-EC-SYS-01: 不明なオプション → exit(1) ─────────────────────────────────

/**
 * `main` 関数のシステムテストスイート（実プロセス起動）。
 *
 * export-chatlog をサブプロセスとして起動し、終了コードを検証する。
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
    /** export-chatlog をサブプロセスで実行する */
    describe('When: export-chatlog をサブプロセスで実行する', () => {
      /** T-EC-SYS-01: プロセスが終了コード 1 で終了する */
      describe('Then: T-EC-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-EC-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runExport(['claude', '--unknown-flag']);
          assertEquals(code, 1);
        });
      });
    });
  });
});
