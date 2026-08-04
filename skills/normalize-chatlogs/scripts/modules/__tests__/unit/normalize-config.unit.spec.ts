// src: skills/normalize-chatlogs/scripts/modules/__tests__/unit/normalize-config.unit.spec.ts
// @(#): normalize-config モジュールのユニットテスト
//       対象: buildConfig
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { buildConfig } from '../../normalize-config.ts';

// ─── Helpers
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';

// ─── Tests

/**
 * `buildConfig` のユニットテストスイート。
 *
 * CLI 引数・GlobalConfig・デフォルト値から NormalizeConfig を構築する処理を検証する。
 *
 * テスト ID 範囲: T-NC-BC-01 〜 T-NC-BC-15
 *
 * @see buildConfig
 */
describe('buildConfig', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  afterEach(() => {
    GlobalConfig.resetInstance();
  });

  /** デフォルト値が適用されるケース。 */
  describe('When: 正常系', () => {
    describe('Given: 空配列', () => {
      describe('When: buildConfig([]) を呼び出す', () => {
        describe('Then: T-NC-BC-01 - デフォルト値が適用される', () => {
          it('T-NC-BC-01-01: concurrency が GlobalConfig のデフォルト値 4 になる', () => {
            assertEquals(buildConfig([]).concurrency, 4);
          });
          it('T-NC-BC-01-02: dryRun が false になる', () => {
            assertEquals(buildConfig([]).dryRun, false);
          });
          it('T-NC-BC-01-03: timeoutMs が GlobalConfig のデフォルト値 120000 になる', () => {
            assertEquals(buildConfig([]).timeoutMs, 120_000);
          });
        });
      });
    });

    describe('Given: --concurrency / --dry-run を指定した引数', () => {
      describe('When: buildConfig(args) を呼び出す', () => {
        describe('Then: T-NC-BC-02 - CLI 引数の値が defaults より優先される', () => {
          it('T-NC-BC-02-01: --concurrency 8 → concurrency = 8', () => {
            assertEquals(buildConfig(['--concurrency', '8']).concurrency, 8);
          });
          it('T-NC-BC-02-02: --dry-run → dryRun = true', () => {
            assertEquals(buildConfig(['--dry-run']).dryRun, true);
          });
        });
      });
    });

    describe('Given: GlobalConfig に chatlogsDir が設定されている', () => {
      beforeEach(async () => {
        await GlobalConfig.getInstance({ yaml: 'chatlogsDir: /global/chatlog' });
      });

      describe('When: buildConfig([]) を呼び出す', () => {
        describe('Then: T-NC-BC-03 - GlobalConfig の chatlogsDir が適用される', () => {
          it('T-NC-BC-03-01: result.chatlogsDir === "/global/chatlog"', () => {
            assertEquals(buildConfig([]).chatlogsDir, '/global/chatlog');
          });
        });
      });
    });

    describe('Given: 空配列', () => {
      describe('When: buildConfig([]) を呼び出す', () => {
        describe('Then: T-NC-BC-04 - outputDir は未指定時 undefined になる', () => {
          it('T-NC-BC-04-01: outputDir が undefined になる', () => {
            assertEquals(buildConfig([]).outputDir, undefined);
          });
        });
      });
    });

    describe('Given: --timeout-ms を指定した引数', () => {
      describe('When: buildConfig(args) を呼び出す', () => {
        describe('Then: T-NC-BC-07 - timeoutMs が適用される', () => {
          it('T-NC-BC-07-01: --timeout-ms 300000 → timeoutMs = 300000', () => {
            assertEquals(buildConfig(['--timeout-ms', '300000']).timeoutMs, 300000);
          });
        });
      });
    });

    describe('Given: --input-dir を指定した引数', () => {
      describe('When: buildConfig(args) を呼び出す', () => {
        describe('Then: T-NC-BC-08 - inputDir が適用される', () => {
          it('T-NC-BC-08-01: --input-dir /data/chatlog → inputDir = "/data/chatlog"', () => {
            assertEquals(buildConfig(['--input-dir', '/data/chatlog']).inputDir, '/data/chatlog');
          });
        });
      });
    });

    describe('Given: オプションなしの空配列', () => {
      describe('When: buildConfig([]) を呼び出す', () => {
        describe('Then: T-NC-BC-09 - GlobalConfig が管理するフィールドはデフォルト値が自動マージされる', () => {
          it('T-NC-BC-09-01: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
            assertEquals(buildConfig([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
          });
          it('T-NC-BC-09-02: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
            assertEquals(buildConfig([]).agent, 'claude');
          });
        });
      });
    });

    describe('Given: 各種オプション', () => {
      describe('When: buildConfig(args) を呼び出す', () => {
        describe('Then: T-NC-BC-10 - 対応フィールドに値が設定される', () => {
          const _cases = [
            { id: 'T-NC-BC-10-01', args: ['--input-dir', '/some/path'], field: 'inputDir', expected: '/some/path' },
            { id: 'T-NC-BC-10-02', args: ['--agent', 'claude'], field: 'agent', expected: 'claude' },
            { id: 'T-NC-BC-10-03', args: ['--period', '2026-03'], field: 'period', expected: '2026-03' },
            { id: 'T-NC-BC-10-04', args: ['--dry-run'], field: 'dryRun', expected: true },
          ] as const;
          for (const { id, args, field, expected } of _cases) {
            it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
              assertEquals(buildConfig([...args])[field], expected);
            });
          }
          it('T-NC-BC-10-05: --output-dir ./out → outputDir は生値（正規化済み）のまま透過される', () => {
            assertEquals(buildConfig(['--output-dir', './out']).outputDir, 'out');
          });
          it('T-NC-BC-10-06: --output-dir /abs/out → outputDir = "/abs/out"（絶対パスはそのまま使用）', () => {
            assertEquals(buildConfig(['--output-dir', '/abs/out']).outputDir, '/abs/out');
          });
        });
      });
    });

    describe('Given: --input-dir のバックスラッシュ', () => {
      describe('Then: T-NC-BC-11 - パス区切りがスラッシュに正規化される', () => {
        it('T-NC-BC-11-01: --input-dir chatlogs\\claude → inputDir = "chatlogs/claude"', () => {
          assertEquals(buildConfig(['--input-dir', 'chatlogs\\claude']).inputDir, 'chatlogs/claude');
        });
      });
    });

    describe('Given: 全オプションを組み合わせた引数', () => {
      describe('Then: T-NC-BC-12 - 全フィールドが正しく解析される', () => {
        it('T-NC-BC-12-01: 全フィールドが正しく解析される', () => {
          const result = buildConfig([
            '--input-dir',
            '/some/path',
            '--agent',
            'claude',
            '--period',
            '2026-03',
            '--dry-run',
            '--concurrency',
            '8',
            '--output-dir',
            './out',
          ]);
          assertEquals(result.inputDir, '/some/path');
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
          assertEquals(result.dryRun, true);
          assertEquals(result.concurrency, 8);
          assertEquals(result.outputDir, 'out');
        });
      });
    });
  });

  /** 異常系: 不正な引数で ChatlogError がスローされる。 */
  describe('When: 異常系', () => {
    describe('Given: 未知のオプション', () => {
      it('T-NC-BC-13-01: --unknown → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(() => buildConfig(['--unknown']), Error, 'Invalid Args');
      });
    });

    describe('Given: 未知のエージェント名', () => {
      it('T-NC-BC-13-02: --agent notexist → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(() => buildConfig(['--agent', 'notexist']), Error);
      });
    });

    describe('Given: 非整数の concurrency', () => {
      it('T-NC-BC-13-03: --concurrency abc → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(() => buildConfig(['--concurrency', 'abc']), Error);
      });
    });
  });

  /** 境界値・defaults 明示指定など特殊なケース。 */
  describe('When: エッジケース', () => {
    describe('Given: GlobalConfig に chatlogsDir が設定されている', () => {
      beforeEach(async () => {
        await GlobalConfig.getInstance({ yaml: 'chatlogsDir: /full' });
      });

      it('[Edge] T-NC-BC-05-01: 全フィールドを指定した引数は defaults を完全に上書きする', () => {
        const result = buildConfig([
          '--agent',
          'claude',
          '--period',
          '2026-03',
          '--dry-run',
          '--concurrency',
          '8',
          '--output-dir',
          './out',
        ]);
        assertEquals(result.concurrency, 8);
        assertEquals(result.dryRun, true);
        assertEquals(result.outputDir, 'out');
      });

      it('[Edge] T-NC-BC-06-01: defaults を明示指定したとき CLI 引数がない値（GlobalConfig 非管理フィールド）は defaults が適用される', () => {
        const result = buildConfig([], { dryRun: true, outputDir: './custom' });
        assertEquals(result.outputDir, './custom');
        assertEquals(result.dryRun, true);
      });
    });

    it('[Edge] T-NC-BC-14-01: --concurrency 0 → concurrency が 0 になる（最小境界値）', () => {
      assertEquals(buildConfig(['--concurrency', '0']).concurrency, 0);
    });

    it('[Edge] T-NC-BC-15-01: 同じオプションを 2 回渡したとき後の値が採用される', () => {
      assertEquals(buildConfig(['--concurrency', '4', '--concurrency', '8']).concurrency, 8);
    });
  });
});
