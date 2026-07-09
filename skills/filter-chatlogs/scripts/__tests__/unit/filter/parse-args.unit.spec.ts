// src: scripts/__tests__/unit/filter/filter-chatlogs.unit.spec.ts
// @(#): filter-chatlogs.ts のユニットテスト
//       対象: parseArgs
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../../filter-chatlogs.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';
// types
import type { FilterParsedConfig } from '../../../types/filter.types.ts';

// ─── Internal Helpers

// types
type Args = FilterParsedConfig;

// ─── Tests

describe('parseArgs', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── T-FL-PA-01: デフォルト値 ───────────────────────────────────────────────

  describe('Given: 引数なしの空配列', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-FL-PA-01 - GlobalConfig が管理しないフィールドは undefined になる', () => {
        const _defaultCases: { id: string; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-01-02', field: 'dryRun', expected: undefined },
          { id: 'T-FL-PA-01-03', field: 'inputDir', expected: undefined },
          { id: 'T-FL-PA-01-04', field: 'period', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([])[field], expected);
          });
        }

        it('T-FL-PA-01-01: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
          assertEquals(parseArgs([]).agent, 'claude');
        });

        it('T-FL-PA-01-05: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
          assertEquals(parseArgs([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
        });
      });
    });
  });

  // ─── T-FL-PA-02〜07: 単一オプション ──────────────────────────────────────────

  describe('Given: 単一オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-02-01', args: ['chatgpt'], field: 'agent', expected: 'chatgpt' },
          { id: 'T-FL-PA-05-01', args: ['--dry-run'], field: 'dryRun', expected: true },
          {
            id: 'T-FL-PA-06-01',
            args: ['--input-dir', '/path/to/input'],
            field: 'inputDir',
            expected: '/path/to/input',
          },
          {
            id: 'T-FL-PA-07-01',
            args: ['--input-dir=/path/to/input'],
            field: 'inputDir',
            expected: '/path/to/input',
          },
        ];
        for (const { id, args, field, expected } of _cases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(args)[field], expected);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-08: 複数オプション組み合わせ ────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --input-dir /input を渡す', () => {
    it('T-FL-PA-08-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(['claude', '2026-03', '--dry-run', '--input-dir', '/input']);
      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
      assert(result.dryRun);
      assertEquals(result.inputDir, '/input');
    });
  });

  // ─── T-FL-PA-09: 異常系 ───────────────────────────────────────────────────────

  describe('Given: 不正な引数', () => {
    it('T-FL-PA-09-01: 未知オプション → ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['--unknown']),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('T-FL-PA-03-01: period 単独指定（agent 省略）→ ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['2026-03']),
        ChatlogError,
      );
    });
  });

  // ─── T-FL-PA-10: --config オプション ─────────────────────────────────────────

  describe('Given: --config オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: configFile フィールドに値が設定される', () => {
        it('T-FL-PA-10-01: --config cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config', 'cfg.yaml']).configFile, 'cfg.yaml');
        });

        it('T-FL-PA-10-02: --config=cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config=cfg.yaml']).configFile, 'cfg.yaml');
        });
      });
    });
  });

  // ─── T-FL-PA-11: --input-dir オプション ──────────────────────────────────────

  describe('Given: --input-dir オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: inputDir フィールドに値が設定される', () => {
        it('T-FL-PA-11-01: --input-dir /input → inputDir が "/input" になる', () => {
          assertEquals(parseArgs(['--input-dir', '/input']).inputDir, '/input');
        });

        it('T-FL-PA-11-02: --input-dir=/input → inputDir が "/input" になる', () => {
          assertEquals(parseArgs(['--input-dir=/input']).inputDir, '/input');
        });
      });
    });
  });

  // ─── T-FL-PA-13: 全オプション組み合わせ ─────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --input-dir /input を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 全フィールドが正しく解析される', () => {
        it('T-FL-PA-13-01: 全フィールドが正しく解析される', () => {
          const result = parseArgs(['claude', '2026-03', '--dry-run', '--input-dir', '/input']);
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
          assert(result.dryRun);
          assertEquals(result.inputDir, '/input');
        });
      });
    });
  });

  // ─── T-FL-PA-14: --input-dir バリデーション ──────────────────────────────────

  /**
   * `--input-dir` にディレクトリパスでない値を渡した場合の異常系グループ。
   *
   * ディレクトリパス（`/` を含む正規化済みパス）でない値は `ChatlogError(InvalidArgs)` をスローする。
   */
  describe('Given: --input-dir にディレクトリパスでない値を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-FL-PA-14-01: --input-dir foo（スラッシュなし）→ ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => parseArgs(['--input-dir', 'foo']),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-FL-PA-16: --input-dir 未指定 ──────────────────────────────────────────

  /**
   * `--input-dir` が未指定のとき `chatlogsDir` は GlobalConfig のデフォルト値、
   * `inputDir` は `undefined` になることを検証するグループ。
   */
  describe('Given: --input-dir が未指定', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir は GlobalConfig のデフォルト値、inputDir は undefined になる', () => {
        it('T-FL-PA-16-01: 引数なし → chatlogsDir が GlobalConfig のデフォルト値になる', () => {
          assertEquals(parseArgs([]).chatlogsDir, DEFAULT_CHATLOGS_DIR);
        });
        it('T-FL-PA-16-02: 引数なし → inputDir が undefined になる', () => {
          assertEquals(parseArgs([]).inputDir, undefined);
        });
      });
    });
  });
});
