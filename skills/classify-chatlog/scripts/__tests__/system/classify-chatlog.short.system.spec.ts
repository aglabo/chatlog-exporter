// src: scripts/__tests__/system/classify-chatlog.short.system.spec.ts
// @(#): 短文ファイル（<MIN_CLASSIFIABLE_LENGTH）→ misc 移動の実ファイルシステム検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { fileExists, fileOrDirExists } from '../../../../_scripts/libs/file-io/exists-utils.ts';

const SCRIPT_PATH = new URL('../../classify-chatlog.ts', import.meta.url).pathname;
const FIXTURE_SYSTEM_DATA = new URL('./fixtures', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const _shouldRunAI = Deno.env.get('RUN_AI') === '1';

async function _runClassify(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const _cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-run', '--allow-env', SCRIPT_PATH, ...args],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await _cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// ─── T-CL-SYS-02: 短文ファイルが misc へ移動される ──────────────────────────────

describe('[AI] main - 短文ファイルの misc 分類', { ignore: !_shouldRunAI }, () => {
  let inputDir: string;
  let dicsDir: string;
  let monthDir: string;

  beforeEach(async () => {
    inputDir = await Deno.makeTempDir({ prefix: 'classify-short-test-' });
    dicsDir = await Deno.makeTempDir({ prefix: 'classify-dics-test-' });
    monthDir = `${inputDir}/claude/2026-03`;
    await Deno.mkdir(monthDir, { recursive: true });
    await Deno.writeTextFile(`${dicsDir}/projects.dic`, 'app1\napp2\n');
  });

  afterEach(async () => {
    await Deno.remove(inputDir, { recursive: true });
    await Deno.remove(dicsDir, { recursive: true });
  });

  describe('Given: 50 文字未満のコンテンツを持つ md ファイルを配置', () => {
    describe('When: classify-chatlog をサブプロセスで実行する', () => {
      describe('Then: T-CL-SYS-02 - ファイルが misc/ に移動される', () => {
        it('[AI] T-CL-SYS-02-01: misc/ にファイルが移動され、project フィールドが挿入される', async () => {
          // フロントマターなし・50 文字未満 → Claude CLI を呼ばず misc へ直接分類
          await Deno.copyFile(`${FIXTURE_SYSTEM_DATA}/short/input.md`, `${monthDir}/test-file.md`);

          const { code, stderr } = await _runClassify(['claude', '--input', inputDir, '--dics', dicsDir]);

          assertEquals(code, 0);

          // AI をスキップしたことを stderr の warn ヘッダーで保証
          assertStringIncludes(stderr, '[skip-ai: too-short]');

          assertEquals(await fileExists(`${monthDir}/misc/test-file.md`), true);

          assertEquals(await fileOrDirExists(`${monthDir}/test-file.md`), false);
        });
      });
    });
  });
});
