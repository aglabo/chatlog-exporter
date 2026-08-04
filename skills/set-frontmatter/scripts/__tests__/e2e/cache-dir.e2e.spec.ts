// src: scripts/__tests__/e2e/cache-dir.e2e.spec.ts
// @(#): main() の --cache-dir E2E テスト
//       --cache-dir の ChatlogCache 連携・出力/キャッシュ生成を確認する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── BDD modules
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../set-frontmatter.ts';

// ─── Helpers
import { installCommandMock } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';
import { readTextFile } from '../../../../_cle-libs/libs/file-io/read-utils.ts';
import { enc, makeDicsDir, makeSequentialMock } from '../helpers/setfm-e2e-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../_cle-libs/__tests__/helpers/logger-stub.ts';

// ─── Tests

// ─── T-SF-E2E-10: --cache-dir が ChatlogCache に渡される ─────────────────────────

describe('main - --cache-dir オプション', () => {
  describe('Given: inputDir に test.md を配置し、--cache-dir を明示指定', () => {
    describe('When: main() を呼び出す', () => {
      describe('Then: T-SF-E2E-10 - cacheDir が ChatlogCache に渡され、出力ファイルが生成される', () => {
        let inputDir: string;
        let outputDir: string;
        let cacheDir: string;
        let dicsDir: string;
        let commandHandle: CommandMockHandle;
        let loggerStub: LoggerStub;

        beforeEach(async () => {
          inputDir = await Deno.makeTempDir();
          outputDir = await Deno.makeTempDir();
          cacheDir = await Deno.makeTempDir();
          dicsDir = await makeDicsDir();

          await Deno.writeTextFile(`${inputDir}/test.md`, '# テスト\n本文テキスト');

          commandHandle = installCommandMock(
            makeSequentialMock([
              enc.encode('research\ndevelopment'),
              enc.encode(
                'title: Generated Title\ntopics:\n  - development\ntags:\n  - lang:typescript\n',
              ),
            ]),
          );
          loggerStub = makeLoggerStub();
        });

        afterEach(async () => {
          commandHandle.restore();
          loggerStub.restore();
          await Deno.remove(inputDir, { recursive: true }).catch(() => {});
          await Deno.remove(outputDir, { recursive: true }).catch(() => {});
          await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
          await Deno.remove(dicsDir.replace(/[/\\]dics$/, ''), { recursive: true }).catch(() => {});
        });

        it('T-SF-E2E-10-01: outputDir に test.md が生成される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          let exists = false;
          try {
            await Deno.stat(`${outputDir}/test.md`);
            exists = true;
          } catch { /* noop */ }
          assertEquals(exists, true);
        });

        it('T-SF-E2E-10-02: 出力ファイルのフロントマターに type, category, title が含まれる', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          const content = await readTextFile(`${outputDir}/test.md`);
          assertStringIncludes(content, 'type:');
          assertStringIncludes(content, 'category:');
          assertStringIncludes(content, 'title:');
        });

        it('T-SF-E2E-10-03: cacheDir/fm-cache/test.json が生成される', async () => {
          await main([
            '--input-dir',
            inputDir,
            '--output-dir',
            outputDir,
            '--cache-dir',
            cacheDir,
            '--no-review',
            '--dics',
            dicsDir,
          ]);

          let exists = false;
          try {
            await Deno.stat(`${cacheDir}/fm-cache/test.json`);
            exists = true;
          } catch { /* noop */ }
          assertEquals(exists, true);
        });
      });
    });
  });
});
