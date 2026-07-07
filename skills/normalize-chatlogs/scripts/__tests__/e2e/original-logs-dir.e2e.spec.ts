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
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

/**
 * `main` の入力ディレクトリ解決テストスイート。
 *
 * `--chatlogs-dir` 未指定時に `originalLogs` を挟んだパスから
 * 入力ファイルを読み込むことを検証する。
 *
 * テスト ID 範囲: T-NC-MAIN-01
 *
 * @see main
 */
describe('main', () => {
  /** originalLogs を挟んだ入力ディレクトリからファイルを読み込むケース。 */
  describe('When: 正常系', () => {
    describe('Given: baseDir 配下の originalLogs/<agent>/<yyyy>/<yyyy-mm> にファイルが存在', () => {
      describe('When: --chatlogs-dir を指定せず main() を呼び出す', () => {
        describe('Then: T-NC-MAIN-01 - originalLogs 配下のファイルが読み込まれる', () => {
          let baseDir: string;
          let outputDir: string;
          let commandHandle: CommandMockHandle;
          let loggerStub: LoggerStub;
          let exitStub: Stub;

          beforeEach(async () => {
            baseDir = normalizePath(await Deno.makeTempDir());
            outputDir = normalizePath(await Deno.makeTempDir());
            const monthDir = `${baseDir}/originalLogs/claude/2026/2026-03`;
            await Deno.mkdir(monthDir, { recursive: true });
            await Deno.writeTextFile(
              `${monthDir}/chat.md`,
              '---\nproject: my-project\n---\n### User\nHello\n\n### AI\nHi there.',
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
          });

          afterEach(async () => {
            commandHandle.restore();
            loggerStub.restore();
            exitStub.restore();
            await Deno.remove(baseDir, { recursive: true });
            await Deno.remove(outputDir, { recursive: true });
          });

          it('T-NC-MAIN-01-01: success=1 がレポートされる', async () => {
            await main([
              '--base-dir',
              baseDir,
              '--agent',
              'claude',
              '--period',
              '2026-03',
              '--normalize-dir',
              outputDir,
            ]);

            assertMatch(loggerStub.infoLogs.join('\n'), /success=1/);
          });

          it('T-NC-MAIN-01-02: Deno.exit が呼ばれない（入力ディレクトリが見つかる）', async () => {
            await main([
              '--base-dir',
              baseDir,
              '--agent',
              'claude',
              '--period',
              '2026-03',
              '--normalize-dir',
              outputDir,
            ]);

            assertEquals(exitStub.calls.length, 0);
          });
        });
      });
    });
  });
});
