// src: scripts/__tests__/system/normalize-chatlogs.main.system.spec.ts
// @(#): normalize-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

const SCRIPT_PATH = new URL('../../normalize-chatlogs.ts', import.meta.url).pathname;

async function runNormalize(args: string[]): Promise<number> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
}

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
