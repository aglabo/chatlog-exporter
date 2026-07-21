// src: skills/normalize-chatlogs/scripts/__tests__/e2e/original-logs-dir.e2e.spec.ts
// @(#): normalize-chatlogs main() の入力ディレクトリ解決テスト
//       対象: main
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertMatch } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { main } from '../../normalize-chatlogs.ts';

// ─── Helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

/**
 * `main` の入力ディレクトリ解決テストスイート。
 *
 * `--input-dir` 未指定時に GlobalConfig の `chatlogsDir` を基準として
 * `originalLogs` を挟んだパスから入力ファイルを読み込むことを検証する。
 *
 * テスト ID 範囲: T-NC-MAIN-01
 *
 * @see main
 */
describe('main', () => {
  /** originalLogs を挟んだ入力ディレクトリからファイルを読み込むケース。 */
  describe('When: 正常系', () => {
    describe('Given: chatlogsDir 配下の originalLogs/<agent>/<yyyy>/<yyyy-mm> にファイルが存在', () => {
      describe('When: --input-dir を指定せず main() を呼び出す', () => {
        describe('Then: T-NC-MAIN-01 - originalLogs 配下のファイルが読み込まれる', () => {
          let chatlogsDir: string;
          let outputDir: string;
          let configFile: string;
          let commandHandle: CommandMockHandle;
          let loggerStub: LoggerStub;
          let exitStub: Stub;

          beforeEach(async () => {
            chatlogsDir = normalizePath(await Deno.makeTempDir());
            outputDir = normalizePath(await Deno.makeTempDir());
            configFile = `${chatlogsDir}/config.yaml`;
            const monthDir = `${chatlogsDir}/originalLogs/claude/2026/2026-03`;
            await Deno.mkdir(monthDir, { recursive: true });
            await Deno.writeTextFile(
              `${monthDir}/chat.md`,
              '---\nproject: my-project\n---\n### User\nHello\n\n### AI\nHi there.',
            );
            // normalize-cache を outputDir 配下に隔離し、他テストの残留キャッシュの影響を防ぐ
            await Deno.writeTextFile(
              configFile,
              `chatlogsDir: "${chatlogsDir}"\ncacheDir: "${outputDir}/cache"\n`,
            );

            const chatPath = normalizePath(`${monthDir}/chat.md`);
            const segmentResponse = JSON.stringify([
              {
                filePath: chatPath,
                segments: [{ title: 'Greeting', summary: 'Say hello', content: '### User\nHello' }],
              },
            ]);
            commandHandle = installCommandMock(
              makeSuccessMock(new TextEncoder().encode(segmentResponse)),
            );
            loggerStub = makeLoggerStub();
            exitStub = stub(Deno, 'exit');
            GlobalConfig.resetInstance();
          });

          afterEach(async () => {
            commandHandle.restore();
            loggerStub.restore();
            exitStub.restore();
            GlobalConfig.resetInstance();
            await Deno.remove(chatlogsDir, { recursive: true });
            await Deno.remove(outputDir, { recursive: true });
          });

          it('T-NC-MAIN-01-01: success=1 がレポートされる', async () => {
            await main([
              '--config',
              configFile,
              '--agent',
              'claude',
              '--period',
              '2026-03',
              '--output-dir',
              outputDir,
            ]);

            assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);
          });

          it('T-NC-MAIN-01-02: Deno.exit が呼ばれない（入力ディレクトリが見つかる）', async () => {
            await main([
              '--config',
              configFile,
              '--agent',
              'claude',
              '--period',
              '2026-03',
              '--output-dir',
              outputDir,
            ]);

            assertEquals(exitStub.calls.length, 0);
          });
        });
      });
    });
  });
});
