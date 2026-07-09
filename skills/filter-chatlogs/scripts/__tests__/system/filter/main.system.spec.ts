// src: scripts/__tests__/system/filter/main.system.spec.ts
// @(#): filter-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

const SCRIPT_PATH = new URL('../../../filter-chatlogs.ts', import.meta.url).pathname;

const runFilter = async (args: string[]): Promise<number> => {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
};

// ─── T-FL-SYS-01: 存在しない inputDir → exit(1) ──────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない inputDir を指定', () => {
    describe('When: filter-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-FL-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-FL-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runFilter(['claude', '--input-dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });
      });
    });
  });
});
