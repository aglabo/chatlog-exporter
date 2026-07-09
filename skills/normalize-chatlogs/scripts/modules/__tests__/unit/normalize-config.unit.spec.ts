// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/normalize-config.unit.spec.ts
// @(#): normalize-config モジュールのユニットテスト
//       対象: parseArgs, buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig, parseArgs } from '../../normalize-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import type { NormalizeParsedConfig } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// types
type _ParsedField = keyof NormalizeParsedConfig;

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * NormalizeParsedConfig・GlobalConfig・デフォルト値から NormalizeConfig を構築する処理を検証する。
 *
 * テスト ID 範囲: T-NC-BC-01 〜 T-NC-BC-07
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  /** デフォルト値が適用されるケース。 */
  describe('When: 正常系', () => {
    describe('Given: 空の parsed', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({ schema: {} });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-01 - デフォルト値が適用される', () => {
          it('T-NC-BC-01-01: concurrency が 4 になる', () => {
            assertEquals(buildConfig({}, globalConfig).concurrency, 4);
          });
          it('T-NC-BC-01-02: dryRun が false になる', () => {
            assertEquals(buildConfig({}, globalConfig).dryRun, false);
          });
          it('T-NC-BC-01-03: timeoutMs が undefined になる', () => {
            assertEquals(buildConfig({}, globalConfig).timeoutMs, undefined);
          });
        });
      });
    });

    describe('Given: 値を持つ parsed', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({ schema: {} });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-02 - parsed の値が defaults より優先される', () => {
          it('T-NC-BC-02-01: concurrency = 8 が適用される', () => {
            assertEquals(buildConfig({ concurrency: 8 }, globalConfig).concurrency, 8);
          });
          it('T-NC-BC-02-02: dryRun = true が適用される', () => {
            assertEquals(buildConfig({ dryRun: true }, globalConfig).dryRun, true);
          });
        });
      });
    });

    describe('Given: GlobalConfig に chatlogsDir が設定されている', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({
          readTextFileProvider: () => 'chatlogsDir: /global/chatlog',
          configFile: 'dummy.yaml',
        });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-03 - GlobalConfig の chatlogsDir が適用される', () => {
          it('T-NC-BC-03-01: result.chatlogsDir === "/global/chatlog"', () => {
            assertEquals(buildConfig({}, globalConfig).chatlogsDir, '/global/chatlog');
          });
        });
      });
    });

    describe('Given: 空の parsed', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({ schema: {} });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-04 - outputDir のデフォルト値が適用される', () => {
          it('T-NC-BC-04-01: outputDir が "./chatlogs/normalizelogs" になる', () => {
            assertEquals(buildConfig({}, globalConfig).outputDir, './chatlogs/normalizelogs');
          });
        });
      });
    });

    describe('Given: timeoutMs を含む parsed', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({ schema: {} });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-07 - timeoutMs が適用される', () => {
          it('T-NC-BC-07-01: timeoutMs = 300000 が適用される', () => {
            assertEquals(buildConfig({ timeoutMs: 300000 }, globalConfig).timeoutMs, 300000);
          });
        });
      });
    });

    describe('Given: inputDir を含む parsed', () => {
      let globalConfig: GlobalConfig;
      beforeEach(async () => {
        globalConfig = await GlobalConfig.getInstance({ schema: {} });
      });

      describe('When: buildConfig(parsed, globalConfig) を呼び出す', () => {
        describe('Then: T-NC-BC-08 - inputDir が適用される', () => {
          it('T-NC-BC-08-01: inputDir = "/data/chatlog" が適用される', () => {
            assertEquals(buildConfig({ inputDir: '/data/chatlog' }, globalConfig).inputDir, '/data/chatlog');
          });
        });
      });
    });
  });

  /** 境界値・defaults 明示指定など特殊なケース。 */
  describe('When: エッジケース', () => {
    let globalConfig: GlobalConfig;
    beforeEach(async () => {
      globalConfig = await GlobalConfig.getInstance({
        readTextFileProvider: () => 'chatlogsDir: /full',
        configFile: 'dummy.yaml',
      });
    });

    it('[Edge] T-NC-BC-05-01: parsed に全フィールドが揃っているとき defaults は完全に上書きされる', () => {
      const parsed: NormalizeParsedConfig = {
        agent: 'claude',
        period: '2026-03',
        dryRun: true,
        concurrency: 8,
        outputDir: './out',
        configFile: './config.yaml',
      };
      const result = buildConfig(parsed, globalConfig);
      assertEquals(result.concurrency, 8);
      assertEquals(result.dryRun, true);
      assertEquals(result.outputDir, './out');
    });

    it('[Edge] T-NC-BC-06-01: defaults を明示指定したとき parsed がない値は defaults が適用される', () => {
      const result = buildConfig({}, globalConfig, { concurrency: 16, dryRun: true, outputDir: './custom' });
      assertEquals(result.concurrency, 16);
      assertEquals(result.dryRun, true);
    });
  });
});

/**
 * `parseArgs` のユニットテストスイート。
 *
 * CLI 引数から NormalizeParsedConfig への変換を検証する。
 * parseArgs は全フィールドを undefined として返し、デフォルト値は buildConfig で適用する。
 *
 * テスト ID 範囲: T-NC-PA-01 〜 T-NC-PA-14
 *
 * @see parseArgs
 */
describe('parseArgs', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  /**
   * 空配列を渡したとき、GlobalConfig が管理しないフィールドは undefined になることを検証する。
   * GlobalConfig が管理するフィールド（chatlogsDir, agent, concurrency, timeoutMs）は
   * parseArgs 内で GlobalConfig のデフォルト値が自動マージされる。
   */
  describe('When: 正常系', () => {
    describe('Given: オプションなしの空配列', () => {
      describe('When: parseArgs([]) を呼び出す', () => {
        describe('Then: T-NC-PA-01 - GlobalConfig が管理しないフィールドは undefined になる', () => {
          const _defaultCases: { id: string; field: _ParsedField }[] = [
            { id: 'T-NC-PA-01-03', field: 'period' },
            { id: 'T-NC-PA-01-04', field: 'dryRun' },
            { id: 'T-NC-PA-01-06', field: 'outputDir' },
            { id: 'T-NC-PA-01-07', field: 'configFile' },
            { id: 'T-NC-PA-01-08', field: 'inputDir' },
          ];
          for (const { id, field } of _defaultCases) {
            it(`${id}: ${field} が undefined になる`, () => {
              assertEquals(parseArgs([])[field], undefined);
            });
          }
        });

        describe('Then: T-NC-PA-01 - GlobalConfig が管理するフィールドはデフォルト値が自動マージされる', () => {
          it('T-NC-PA-01-01: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
            assertEquals(parseArgs([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
          });
          it('T-NC-PA-01-02: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
            assertEquals(parseArgs([]).agent, 'claude');
          });
          it('T-NC-PA-01-05: concurrency が GlobalConfig のデフォルト値 4 になる', () => {
            assertEquals(parseArgs([]).concurrency, 4);
          });
          it('T-NC-PA-01-09: timeoutMs が GlobalConfig のデフォルト値 120000 になる', () => {
            assertEquals(parseArgs([]).timeoutMs, 120_000);
          });
        });
      });
    });

    describe('Given: 各種オプション', () => {
      describe('When: parseArgs(args) を呼び出す', () => {
        describe('Then: 対応フィールドに値が設定される', () => {
          const _cases: { id: string; args: string[]; field: _ParsedField; expected: unknown }[] = [
            { id: 'T-NC-PA-02-01', args: ['--input-dir', '/some/path'], field: 'inputDir', expected: '/some/path' },
            { id: 'T-NC-PA-03-01', args: ['--agent', 'claude'], field: 'agent', expected: 'claude' },
            { id: 'T-NC-PA-04-01', args: ['--period', '2026-03'], field: 'period', expected: '2026-03' },
            { id: 'T-NC-PA-05-01', args: ['--dry-run'], field: 'dryRun', expected: true },
            { id: 'T-NC-PA-06-01', args: ['--concurrency', '8'], field: 'concurrency', expected: 8 },
            { id: 'T-NC-PA-07-01', args: ['--output-dir', './out'], field: 'outputDir', expected: 'out' },
            {
              id: 'T-NC-PA-11-01',
              args: ['--config', './config.yaml'],
              field: 'configFile',
              expected: './config.yaml',
            },
            { id: 'T-NC-PA-15-01', args: ['--timeout-ms', '300000'], field: 'timeoutMs', expected: 300000 },
          ];
          for (const { id, args, field, expected } of _cases) {
            it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
              assertEquals(parseArgs(args)[field], expected);
            });
          }
        });
      });
    });

    describe('Given: パス引数（positional）', () => {
      describe('When: parseArgs(args) を呼び出す', () => {
        describe('Then: T-NC-PA-08 - 位置引数が適切なフィールドに設定される', () => {
          const _pathCases: { id: string; args: string[]; field: _ParsedField; expected: unknown }[] = [
            { id: 'T-NC-PA-08-02', args: ['claude'], field: 'agent', expected: 'claude' },
          ];
          for (const { id, args, field, expected } of _pathCases) {
            it(`${id}: ${field} が "${expected}" になる`, () => {
              assertEquals(parseArgs(args)[field], expected);
            });
          }

          it('T-NC-PA-08-01: period 単独指定（agent 省略）→ ChatlogError(InvalidArgs)', () => {
            assertThrows(() => parseArgs(['2026-03']), ChatlogError);
          });
        });
      });
    });

    describe('Given: --input-dir のバックスラッシュ', () => {
      it('T-NC-PA-02-02: --input-dir chatlogs\\claude → inputDir = "chatlogs/claude"', () => {
        assertEquals(parseArgs(['--input-dir', 'chatlogs\\claude']).inputDir, 'chatlogs/claude');
      });
    });

    describe('Given: 全オプションを組み合わせた引数', () => {
      it('T-NC-PA-09-01: 全フィールドが正しく解析される', () => {
        const result = parseArgs([
          '--input-dir',
          '/some/path',
          '--agent',
          'claude',
          '--period',
          '2026-03',
          '--config',
          './config.yaml',
          '--dry-run',
          '--concurrency',
          '8',
          '--output-dir',
          './out',
        ]);
        assertEquals(result.inputDir, '/some/path');
        assertEquals(result.agent, 'claude');
        assertEquals(result.period, '2026-03');
        assertEquals(result.configFile, './config.yaml');
        assertEquals(result.dryRun, true);
        assertEquals(result.concurrency, 8);
        assertEquals(result.outputDir, 'out');
      });
    });
  });

  describe('When: 異常系', () => {
    describe('Given: 未知のオプション', () => {
      it('T-NC-PA-10-01: ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgs(['--unknown']),
          Error,
          'Invalid Args',
        );
      });
    });

    describe('Given: 未知のエージェント名', () => {
      it('T-NC-PA-10-02: --agent notexist → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgs(['--agent', 'notexist']),
          Error,
        );
      });
    });

    describe('Given: 非整数の concurrency', () => {
      it('T-NC-PA-10-03: --concurrency abc → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgs(['--concurrency', 'abc']),
          Error,
        );
      });
    });
  });

  /** 境界値・重複オプションなど特殊なケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-NC-PA-13-01: --concurrency 0 → concurrency が 0 になる（最小境界値）', () => {
      assertEquals(parseArgs(['--concurrency', '0']).concurrency, 0);
    });

    it('[Edge] T-NC-PA-14-01: 同じオプションを 2 回渡したとき後の値が採用される', () => {
      assertEquals(parseArgs(['--concurrency', '4', '--concurrency', '8']).concurrency, 8);
    });
  });
});
