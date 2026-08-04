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
import { _setByTypeForTest, parseArgs } from '../../../../../_cle-libs/libs/io/parse-args.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../../../../_cle-libs/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_cle-libs/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_CHATLOGS_DIR } from '../../../../../_cle-libs/constants/defaults.constants.ts';
import { DEFAULT_FILTER_CONFIG } from '../../../constants/common.constants.ts';
// types
import type { ArgSchema, ArgSchemaEntry, ParsedArgs } from '../../../../../_cle-libs/types/args-schema.types.ts';
import type { FilterParsedConfig } from '../../../types/filter.types.ts';

// ─── Internal Helpers

// constants
const _SCHEMA: ArgSchema<FilterParsedConfig> = [];

/** min=1, max=10 の範囲チェック付き integer 型スキーマエントリ（`--chunk-size` 相当）。 */
const _CHUNK_SIZE_ENTRY: ArgSchemaEntry = {
  option: '--chunk-size',
  field: 'chunkSize',
  type: 'integer',
  min: 1,
  max: 10,
};

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
          { id: 'T-FL-PA-01-02', field: 'dryRun', expected: false },
          { id: 'T-FL-PA-01-03', field: 'inputDir', expected: undefined },
          { id: 'T-FL-PA-01-04', field: 'period', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([], _SCHEMA, DEFAULT_FILTER_CONFIG)[field], expected);
          });
        }

        it('T-FL-PA-01-01: agent が GlobalConfig のデフォルト値 "claude" になる', () => {
          assertEquals(parseArgs([], _SCHEMA, DEFAULT_FILTER_CONFIG).agent, 'claude');
        });

        it('T-FL-PA-01-05: chatlogsDir が GlobalConfig のデフォルト値になる', () => {
          assertEquals(parseArgs([], _SCHEMA, DEFAULT_FILTER_CONFIG).chatlogsDir, DEFAULT_CHATLOGS_DIR);
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
            assertEquals(parseArgs(args, _SCHEMA, DEFAULT_FILTER_CONFIG)[field], expected);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-08: 複数オプション組み合わせ ────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --input-dir /input を渡す', () => {
    it('T-FL-PA-08-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(
        ['claude', '2026-03', '--dry-run', '--input-dir', '/input'],
        _SCHEMA,
        DEFAULT_FILTER_CONFIG,
      );
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
        () => parseArgs(['--unknown'], _SCHEMA, DEFAULT_FILTER_CONFIG),
        ChatlogError,
        'Invalid Args',
      );
    });

    it('T-FL-PA-03-01: period 単独指定（agent 省略）→ ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['2026-03'], _SCHEMA, DEFAULT_FILTER_CONFIG),
        ChatlogError,
      );
    });
  });

  // ─── T-FL-PA-10: --config オプション ─────────────────────────────────────────

  describe('Given: --config オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: configFile フィールドに値が設定される', () => {
        it('T-FL-PA-10-01: --config cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config', 'cfg.yaml'], _SCHEMA, DEFAULT_FILTER_CONFIG).configFile, 'cfg.yaml');
        });

        it('T-FL-PA-10-02: --config=cfg.yaml → configFile が "cfg.yaml" になる', () => {
          assertEquals(parseArgs(['--config=cfg.yaml'], _SCHEMA, DEFAULT_FILTER_CONFIG).configFile, 'cfg.yaml');
        });
      });
    });
  });

  // ─── T-FL-PA-11: --input-dir オプション ──────────────────────────────────────

  describe('Given: --input-dir オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: inputDir フィールドに値が設定される', () => {
        it('T-FL-PA-11-01: --input-dir /input → inputDir が "/input" になる', () => {
          assertEquals(parseArgs(['--input-dir', '/input'], _SCHEMA, DEFAULT_FILTER_CONFIG).inputDir, '/input');
        });

        it('T-FL-PA-11-02: --input-dir=/input → inputDir が "/input" になる', () => {
          assertEquals(parseArgs(['--input-dir=/input'], _SCHEMA, DEFAULT_FILTER_CONFIG).inputDir, '/input');
        });
      });
    });
  });

  // ─── T-FL-PA-13: 全オプション組み合わせ ─────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --input-dir /input を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 全フィールドが正しく解析される', () => {
        it('T-FL-PA-13-01: 全フィールドが正しく解析される', () => {
          const result = parseArgs(
            ['claude', '2026-03', '--dry-run', '--input-dir', '/input'],
            _SCHEMA,
            DEFAULT_FILTER_CONFIG,
          );
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
            () => parseArgs(['--input-dir', 'foo'], _SCHEMA, DEFAULT_FILTER_CONFIG),
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
          assertEquals(parseArgs([], _SCHEMA, DEFAULT_FILTER_CONFIG).chatlogsDir, DEFAULT_CHATLOGS_DIR);
        });
        it('T-FL-PA-16-02: 引数なし → inputDir が undefined になる', () => {
          assertEquals(parseArgs([], _SCHEMA, DEFAULT_FILTER_CONFIG).inputDir, undefined);
        });
      });
    });
  });

  // ─── T-FL-PA-17: _setByType integer 型の min/max 範囲チェック ────────────────

  /**
   * `entry.type === 'integer'` に `min`/`max` を指定した場合の範囲チェックを検証するグループ。
   *
   * `min`/`max` を満たす値は `config` にセットされ、範囲外の値は
   * `ChatlogError('InvalidArgs', 'OutOfRange', ...)` を返す。
   */
  describe('Given: integer 型スキーマに min/max が指定されている', () => {
    describe('When: _setByType を呼び出す', () => {
      describe('Then: T-FL-PA-17 - 範囲内の値は config にセットされる', () => {
        const _inRangeCases: { id: string; rawValue: string; expected: number }[] = [
          { id: 'T-FL-PA-17-01', rawValue: '1', expected: 1 },
          { id: 'T-FL-PA-17-02', rawValue: '10', expected: 10 },
        ];
        for (const { id, rawValue, expected } of _inRangeCases) {
          it(`${id}: min=1, max=10, rawValue="${rawValue}" → config.chunkSize === ${expected}`, () => {
            const config: ParsedArgs = {};
            const err = _setByTypeForTest(config, _CHUNK_SIZE_ENTRY, rawValue);
            assertEquals(err, null);
            assertEquals(config.chunkSize, expected);
          });
        }
      });

      describe('Then: T-FL-PA-18 - 範囲外の値は ChatlogError(InvalidArgs, OutOfRange) を返す', () => {
        const _outOfRangeCases: { id: string; rawValue: string }[] = [
          { id: 'T-FL-PA-18-01', rawValue: '0' },
          { id: 'T-FL-PA-18-02', rawValue: '-1' },
          { id: 'T-FL-PA-18-03', rawValue: '11' },
        ];
        for (const { id, rawValue } of _outOfRangeCases) {
          it(`${id}: min=1, max=10, rawValue="${rawValue}" → ChatlogError(InvalidArgs)`, () => {
            const config: ParsedArgs = {};
            const err = _setByTypeForTest(config, _CHUNK_SIZE_ENTRY, rawValue);
            assert(err instanceof ChatlogError);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-19: _setByType integer 型で min/max 未指定（回帰確認） ──────────

  /**
   * `min`/`max` を指定しない integer 型エントリでは範囲チェックが行われないことを検証するグループ
   * （既存動作の回帰確認）。
   */
  describe('Given: integer 型スキーマに min/max が指定されていない', () => {
    describe('When: _setByType を呼び出す', () => {
      describe('Then: T-FL-PA-19 - 範囲チェックが行われず値がそのままセットされる', () => {
        const _noRangeCheckCases: { id: string; rawValue: string; expected: number }[] = [
          { id: 'T-FL-PA-19-01', rawValue: '0', expected: 0 },
          { id: 'T-FL-PA-19-02', rawValue: '-100', expected: -100 },
        ];
        for (const { id, rawValue, expected } of _noRangeCheckCases) {
          it(`${id}: min/max 未指定, rawValue="${rawValue}" → config.someField === ${expected}（エラーなし）`, () => {
            const config: ParsedArgs = {};
            const err = _setByTypeForTest(
              config,
              { option: '--some-int', field: 'someField', type: 'integer' },
              rawValue,
            );
            assertEquals(err, null);
            assertEquals(config.someField, expected);
          });
        }
      });
    });
  });
});
