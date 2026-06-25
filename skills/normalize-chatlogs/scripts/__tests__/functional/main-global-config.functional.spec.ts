// src: skills/normalize-chatlogs/scripts/__tests__/functional/main-global-config.functional.spec.ts
// @(#): main() の GlobalConfig 連携機能テスト
//       対象: main (GlobalConfig.getInstance → timeoutMs → buildConfig 連携)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { main } from '../../normalize-chatlogs.ts';

// ─── Helpers
import { installCommandMock, makeSuccessMock } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { silenceLog } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
import { normalizePath } from '../../../../_scripts/libs/path-utils/path-utils.ts';
// types
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LogSilencer } from '../../../../_scripts/__tests__/helpers/e2e-setup.ts';

// ─── Tests

/**
 * `main` が GlobalConfig から `timeoutMs` を取得して `buildConfig` の defaults に渡すことを検証する。
 *
 * GlobalConfig singleton が config.yaml の値を読み込んでいるかどうかは、
 * main 実行後に GlobalConfig.getInstance().get('timeoutMs') の値で確認する。
 *
 * テスト ID 範囲: T-NC-MG-01
 *
 * @see main
 * @see GlobalConfig
 */
describe('main - GlobalConfig 連携', () => {
  /**
   * config.yaml に timeoutMs=200000 が設定されている場合、
   * main 実行後の GlobalConfig シングルトンが timeoutMs=200000 を保持していること。
   */
  describe('Given: config.yaml に timeoutMs=200000 が設定されている', () => {
    describe('When: main に --config オプションで config.yaml を渡す', () => {
      let inputDir: string;
      let outputDir: string;
      let configFile: string;
      let commandHandle: CommandMockHandle;
      let logSilencer: LogSilencer;

      beforeEach(async () => {
        inputDir = normalizePath(await Deno.makeTempDir());
        outputDir = normalizePath(await Deno.makeTempDir());
        const configsDir = normalizePath(await Deno.makeTempDir());
        configFile = `${configsDir}/config.yaml`;

        // config.yaml with timeoutMs=200000
        await Deno.writeTextFile(configFile, 'timeoutMs: 200000\n');

        // 1 MD file
        await Deno.writeTextFile(
          `${inputDir}/chat.md`,
          '---\nproject: test\n---\n### User\nHello\n\n### AI\nHi',
        );

        // mock AI command returning empty segments
        commandHandle = installCommandMock(
          makeSuccessMock(new TextEncoder().encode('[]')),
        );
        logSilencer = silenceLog();

        GlobalConfig.resetInstance();
      });

      afterEach(async () => {
        commandHandle.restore();
        logSilencer.restore();
        GlobalConfig.resetInstance();
        await Deno.remove(inputDir, { recursive: true }).catch(() => {});
        await Deno.remove(outputDir, { recursive: true }).catch(() => {});
      });

      /** 正常系: main 実行後に GlobalConfig シングルトンが timeoutMs=200000 を保持している */
      describe('Then: T-NC-MG-01 - GlobalConfig が timeoutMs=200000 を保持している', () => {
        it('[Normal] T-NC-MG-01-01: main 実行後 GlobalConfig.get("timeoutMs") が 200000 である', async () => {
          await main(['--chatlogs-dir', inputDir, '--normalize-dir', outputDir, '--config', configFile]);

          // After main runs, the singleton should have been initialized with the config file
          const _gc = await GlobalConfig.getInstance();
          assertEquals(_gc.get('timeoutMs'), 200000);
        });
      });
    });
  });
});
