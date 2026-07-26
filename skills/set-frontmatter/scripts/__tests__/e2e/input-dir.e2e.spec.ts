// src: scripts/__tests__/e2e/input-dir.e2e.spec.ts
// @(#): main() の --input-dir デフォルト絞り込み E2E テスト
//       --input-dir 未指定時の resolveChatlogsDir デフォルト絞り込み・GlobalConfig 注入を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../set-frontmatter.ts';

// ─── Helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { _enc, _makeDicsDir } from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

// ─── T-SF-E2E-12: --input-dir 未指定 → resolveChatlogsDir による agent 絞り込み ────

/**
 * `--input-dir` を省略したとき、`chatlogsDir/normalizelogs/<agent>` が
 * `resolveChatlogsDir` により算出され、そのディレクトリ配下のファイルが処理されることを検証する。
 *
 * テスト ID 範囲: T-SF-E2E-12-01
 */
describe('main - --input-dir 未指定（デフォルト絞り込み）', () => {
  describe('Given: chatlogsDir/normalizelogs/claude 配下に .md ファイルを配置し --input-dir を省略', () => {
    describe('When: main(["claude", "--output-dir", outDir, ...]) を呼び出す（GlobalConfig.chatlogsDir で注入）', () => {
      describe('Then: T-SF-E2E-12 - chatlogsDir/normalizelogs/claude 配下のファイルが処理される', () => {
        let chatlogsDir: string;
        let outputDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          chatlogsDir = await Deno.makeTempDir();
          const agentDir = `${chatlogsDir}/normalizelogs/claude`;
          await Deno.mkdir(agentDir, { recursive: true });
          await Deno.writeTextFile(`${agentDir}/test.md`, '# テスト\n本文テキスト');

          outputDir = await Deno.makeTempDir();
          dicsDir = await _makeDicsDir();

          GlobalConfig.resetInstance();
          await GlobalConfig.getInstance({
            readTextFileProvider: () => `chatlogsDir: '${chatlogsDir}'`,
            configFile: 'dummy.yaml',
          });

          commandHandle = installCommandMock(
            makeSuccessMock(_enc.encode('research\ndevelopment'), { value: [] }),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          GlobalConfig.resetInstance();
          await Deno.remove(chatlogsDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('[Normal] T-SF-E2E-12-01: chatlogsDir/normalizelogs/claude/test.md がメタ読み込みされる', async () => {
          await main([
            'claude',
            '--output-dir',
            outputDir,
            '--dry-run',
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          assertEquals(loggerStub.infoLogs.some((l) => l.includes('メタ読み込み: 1件')), true);
        });
      });
    });
  });
});
