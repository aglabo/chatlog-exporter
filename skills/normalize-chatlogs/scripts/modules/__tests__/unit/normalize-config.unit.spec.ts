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
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig, parseArgs } from '../../normalize-config.ts';
// types
import type { NormalizeParsedConfig } from '../../../types/normalize.types.ts';

// ─── Internal Helpers

// types
type _ParsedField = keyof NormalizeParsedConfig;

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * NormalizeParsedConfig にデフォルト値を適用して NormalizeConfig を生成する処理を検証する。
 *
 * テスト ID 範囲: T-NC-BC-01 〜 T-NC-BC-04
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  /** デフォルト値が適用されるケース。 */
  describe('When: 正常系', () => {
    describe('Given: 空の parsed', () => {
      describe('When: buildConfig({}) を呼び出す', () => {
        describe('Then: T-NC-BC-01 - デフォルト値が適用される', () => {
          it('T-NC-BC-01-01: concurrency が 4 になる', () => {
            assertEquals(buildConfig({}).concurrency, 4);
          });
          it('T-NC-BC-01-02: dryRun が false になる', () => {
            assertEquals(buildConfig({}).dryRun, false);
          });
        });
      });
    });

    describe('Given: 値を持つ parsed', () => {
      describe('When: buildConfig(parsed) を呼び出す', () => {
        describe('Then: T-NC-BC-02 - parsed の値が defaults より優先される', () => {
          it('T-NC-BC-02-01: concurrency = 8 が適用される', () => {
            assertEquals(buildConfig({ concurrency: 8 }).concurrency, 8);
          });
          it('T-NC-BC-02-02: dryRun = true が適用される', () => {
            assertEquals(buildConfig({ dryRun: true }).dryRun, true);
          });
        });
      });
    });

    describe('Given: baseDir を含む parsed', () => {
      describe('When: buildConfig(parsed) を呼び出す', () => {
        describe('Then: T-NC-BC-03 - フィールドが適用される', () => {
          it('T-NC-BC-03-01: baseDir = "./base" が適用される', () => {
            assertEquals(buildConfig({ baseDir: './base' }).baseDir, './base');
          });
        });
      });
    });

    describe('Given: 空の parsed', () => {
      describe('When: buildConfig({}) を呼び出す', () => {
        describe('Then: T-NC-BC-04 - normalizeDir のデフォルト値が適用される', () => {
          it('T-NC-BC-04-01: normalizeDir が "./chatlogs/normalizelogs" になる', () => {
            assertEquals(buildConfig({}).normalizeDir, './chatlogs/normalizelogs');
          });
        });
      });
    });
  });
});

/**
 * `parseArgs` のユニットテストスイート。
 *
 * CLI 引数から NormalizeParsedConfig への変換を検証する。
 * parseArgs は全フィールドを undefined として返し、デフォルト値は buildConfig で適用する。
 *
 * テスト ID 範囲: T-NC-PA-01 〜 T-NC-PA-12
 *
 * @see parseArgs
 */
describe('parseArgs', () => {
  /**
   * 空配列を渡したとき、全フィールドが undefined になることを検証する。
   * デフォルト値（dryRun=false, concurrency=4）は buildConfig の責務。
   */
  describe('When: 正常系', () => {
    describe('Given: オプションなしの空配列', () => {
      describe('When: parseArgs([]) を呼び出す', () => {
        describe('Then: T-NC-PA-01 - 全フィールドが undefined になる', () => {
          const _defaultCases: { id: string; field: _ParsedField }[] = [
            { id: 'T-NC-PA-01-01', field: 'chatlogsDir' },
            { id: 'T-NC-PA-01-02', field: 'agent' },
            { id: 'T-NC-PA-01-03', field: 'period' },
            { id: 'T-NC-PA-01-04', field: 'dryRun' },
            { id: 'T-NC-PA-01-05', field: 'concurrency' },
            { id: 'T-NC-PA-01-06', field: 'normalizeDir' },
            { id: 'T-NC-PA-01-07', field: 'configFile' },
            { id: 'T-NC-PA-01-08', field: 'baseDir' },
          ];
          for (const { id, field } of _defaultCases) {
            it(`${id}: ${field} が undefined になる`, () => {
              assertEquals(parseArgs([])[field], undefined);
            });
          }
        });
      });
    });

    describe('Given: 各種オプション', () => {
      describe('When: parseArgs(args) を呼び出す', () => {
        describe('Then: 対応フィールドに値が設定される', () => {
          const _cases: { id: string; args: string[]; field: _ParsedField; expected: unknown }[] = [
            {
              id: 'T-NC-PA-02-01',
              args: ['--chatlogs-dir', '/some/path'],
              field: 'chatlogsDir',
              expected: '/some/path',
            },
            { id: 'T-NC-PA-03-01', args: ['--agent', 'claude'], field: 'agent', expected: 'claude' },
            { id: 'T-NC-PA-04-01', args: ['--period', '2026-03'], field: 'period', expected: '2026-03' },
            { id: 'T-NC-PA-05-01', args: ['--dry-run'], field: 'dryRun', expected: true },
            { id: 'T-NC-PA-06-01', args: ['--concurrency', '8'], field: 'concurrency', expected: 8 },
            { id: 'T-NC-PA-07-01', args: ['--normalize-dir', './out'], field: 'normalizeDir', expected: './out' },
            {
              id: 'T-NC-PA-11-01',
              args: ['--config', './config.yaml'],
              field: 'configFile',
              expected: './config.yaml',
            },
            { id: 'T-NC-PA-12-01', args: ['--base-dir', './base'], field: 'baseDir', expected: './base' },
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
            { id: 'T-NC-PA-08-01', args: ['2026-03'], field: 'period', expected: '2026-03' },
            { id: 'T-NC-PA-08-02', args: ['claude'], field: 'agent', expected: 'claude' },
            {
              id: 'T-NC-PA-08-03',
              args: ['chatlogs/claude/2026/2026-03'],
              field: 'chatlogsDir',
              expected: 'chatlogs/claude/2026/2026-03',
            },
            {
              id: 'T-NC-PA-08-04',
              args: ['chatlogs\\claude\\2026\\2026-03'],
              field: 'chatlogsDir',
              expected: 'chatlogs/claude/2026/2026-03',
            },
          ];
          for (const { id, args, field, expected } of _pathCases) {
            it(`${id}: ${field} が "${expected}" になる`, () => {
              assertEquals(parseArgs(args)[field], expected);
            });
          }
        });
      });
    });

    describe('Given: --chatlogs-dir のバックスラッシュ', () => {
      it('T-NC-PA-02-02: --chatlogs-dir chatlogs\\claude → chatlogsDir = "chatlogs/claude"', () => {
        assertEquals(parseArgs(['--chatlogs-dir', 'chatlogs\\claude']).chatlogsDir, 'chatlogs/claude');
      });
    });

    describe('Given: 全オプションを組み合わせた引数', () => {
      it('T-NC-PA-09-01: 全フィールドが正しく解析される', () => {
        const result = parseArgs([
          '--chatlogs-dir',
          '/some/path',
          '--base-dir',
          './base',
          '--agent',
          'claude',
          '--period',
          '2026-03',
          '--config',
          './config.yaml',
          '--dry-run',
          '--concurrency',
          '8',
          '--normalize-dir',
          './out',
        ]);
        assertEquals(result.chatlogsDir, '/some/path');
        assertEquals(result.baseDir, './base');
        assertEquals(result.agent, 'claude');
        assertEquals(result.period, '2026-03');
        assertEquals(result.configFile, './config.yaml');
        assertEquals(result.dryRun, true);
        assertEquals(result.concurrency, 8);
        assertEquals(result.normalizeDir, './out');
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
});
