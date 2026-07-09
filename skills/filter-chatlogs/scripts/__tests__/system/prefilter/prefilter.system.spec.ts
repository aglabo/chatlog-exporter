// src: scripts/__tests__/system/prefilter/prefilter.system.spec.ts
// @(#): prefilter-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

const SCRIPT_PATH = new URL('../../../prefilter-chatlogs.ts', import.meta.url).pathname;

const runPrefilter = async (args: string[]): Promise<number> => {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
};

// ─── T-PF-SYS-01: 存在しない inputDir → exit(1) ──────────────────────────────

describe('main - エラー終了コード', () => {
  describe('Given: 存在しない inputDir を指定', () => {
    describe('When: prefilter-chatlogs をサブプロセスで実行する', () => {
      describe('Then: T-PF-SYS-01 - プロセスが終了コード 1 で終了する', () => {
        it('T-PF-SYS-01-01: 終了コードが 1 である', async () => {
          const code = await runPrefilter(['claude', '--input-dir', '/nonexistent/path']);
          assertEquals(code, 1);
        });
      });
    });
  });
});
