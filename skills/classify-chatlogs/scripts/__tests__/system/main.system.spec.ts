// src: scripts/__tests__/system/classify-chatlogs.main.system.spec.ts
// @(#): classify-chatlogs main() のシステムテスト（実プロセス起動による終了コード検証）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';

const SCRIPT_PATH = normalizePath(new URL('../../classify-chatlogs.ts', import.meta.url).pathname);

async function runClassify(args: string[]): Promise<number> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', SCRIPT_PATH, ...args],
    stdout: 'null',
    stderr: 'null',
  });
  const { code } = await _cmd.output();
  return code;
}

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
