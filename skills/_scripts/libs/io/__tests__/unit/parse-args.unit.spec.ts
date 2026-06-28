// src: skills/_scripts/__tests__/unit/parse-args.unit.spec.ts
// @(#): parseArgsToConfig のユニットテスト
//       オプション解析・フラグ解析・位置引数解析・エラー処理

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import {
  _initSchemaForTest,
  _setByTypeForTest,
  isArgDirectory,
  isArgPeriod,
  parseArgsToConfig,
} from '../../parse-args.ts';

// ─── Helpers
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';
// types
import type { ArgsSchema } from '../../../../types/args-schema.types.ts';

// ─── Internal Helpers

// types
type TestConfig = {
  agent?: string;
  period?: string;
  chatlogsDir?: string;
  outputDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
};

// constants
const TEST_SCHEMA: ArgsSchema = [
  { option: '--output', field: 'outputDir', type: 'string' },
  { option: '--dry-run', field: 'dryRun', type: 'flag' },
  { option: '--verbose', field: 'verbose', type: 'flag' },
];

// ─── Tests

// ─── T-PA-22: _initSchemaForTest ─────────────────────────────────────────────

/**
 * `_initSchemaForTest` のユニットテストスイート。
 *
 * デフォルトスキーマ＋呼び出し元スキーマを結合した Map を返すことを検証する。
 *
 * テスト ID 範囲: T-PA-22-01 〜 T-PA-22-03
 *
 * @see _initSchemaForTest
 */
describe('_initSchemaForTest', () => {
  /** 正常なスキーマを渡して Map が生成されるケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PA-22-01: 空スキーマ → デフォルトエントリのみ含む Map が返る', () => {
      const _map = _initSchemaForTest([]);
      assert(_map.has('period'));
      assert(_map.has('agent'));
      assert(_map.has('chatlogsDir'));
    });
    it('[Normal] T-PA-22-02: 追加スキーマあり → デフォルト＋追加エントリを含む Map が返る', () => {
      const _map = _initSchemaForTest([{ option: '--output', field: 'outputDir', type: 'string' }]);
      assert(_map.has('--output'));
      assert(_map.has('period'));
    });
    it('[Normal] T-PA-22-03: flag 型エントリが正しく含まれる', () => {
      const _map = _initSchemaForTest([{ option: '--dry-run', field: 'dryRun', type: 'flag' }]);
      assertEquals(_map.get('--dry-run')?.type, 'flag');
    });
  });
});

// ─── T-PA-ST-N: _setByTypeForTest negated パラメータ ────────────────────────

/**
 * `_setByTypeForTest` の `negated` パラメータテストスイート。
 *
 * `negated=true` 時に flag フィールドを `false` にセットし、
 * non-flag に対しては `ChatlogError` を返すことを検証する。
 *
 * テスト ID 範囲: T-PA-ST-N-01 〜 T-PA-ST-N-04
 *
 * @see _setByTypeForTest
 */
describe('_setByTypeForTest (negated)', () => {
  /** negated パラメータの正常系ケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-PA-ST-N-01: flag + negated=true → field が false にセットされる', () => {
      const _config: Record<string, string | boolean | number> = {};
      const _entry = { option: '--dry-run', field: 'dryRun', type: 'flag' as const };
      const _err = _setByTypeForTest(_config, _entry, undefined, true);
      assertEquals(_err, null);
      assertEquals(_config['dryRun'], false);
    });

    it('[Normal] T-PA-ST-N-04: flag + negated=false (未指定) → field が true にセットされる（既存回帰）', () => {
      const _config: Record<string, string | boolean | number> = {};
      const _entry = { option: '--dry-run', field: 'dryRun', type: 'flag' as const };
      const _err = _setByTypeForTest(_config, _entry, undefined);
      assertEquals(_err, null);
      assertEquals(_config['dryRun'], true);
    });
  });

  /** negated パラメータの異常系ケース。 */
  describe('When: 異常系', () => {
    it('[Error] T-PA-ST-N-02: flag + negated=true + rawValue → ChatlogError が返る', () => {
      const _config: Record<string, string | boolean | number> = {};
      const _entry = { option: '--dry-run', field: 'dryRun', type: 'flag' as const };
      const _err = _setByTypeForTest(_config, _entry, 'true', true);
      assertEquals(_err instanceof ChatlogError, true);
    });

    it('[Error] T-PA-ST-N-03: string 型 + negated=true → ChatlogError が返る', () => {
      const _config: Record<string, string | boolean | number> = {};
      const _entry = { option: '--output', field: 'outputDir', type: 'string' as const };
      const _err = _setByTypeForTest(_config, _entry, undefined, true);
      assertEquals(_err instanceof ChatlogError, true);
    });
  });
});

// ─── T-PA-01: 空配列 → 全フィールド undefined ─────────────────────────────

describe('parseArgsToConfig', () => {
  describe('Given: 空の引数配列', () => {
    describe('When: parseArgsToConfig([]) を呼び出す', () => {
      describe('Then: T-PA-01 - 全フィールドが undefined', () => {
        const _cases: { id: string; field: keyof TestConfig }[] = [
          { id: 'T-PA-01-01', field: 'agent' },
          { id: 'T-PA-01-02', field: 'period' },
          { id: 'T-PA-01-04', field: 'outputDir' },
          { id: 'T-PA-01-05', field: 'dryRun' },
          { id: 'T-PA-01-06', field: 'verbose' },
        ];
        for (const { id, field } of _cases) {
          it(`${id}: ${field} が undefined になる`, () => {
            const result = parseArgsToConfig<TestConfig>([], TEST_SCHEMA);
            assertEquals(result[field], undefined);
          });
        }
      });
    });
  });

  // ─── T-PA-02: フラグオプション ────────────────────────────────────────────

  describe('Given: フラグオプション', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-02 - 対応フィールドが true になる', () => {
        const _cases: { id: string; args: string[]; field: keyof TestConfig }[] = [
          { id: 'T-PA-02-01', args: ['--dry-run'], field: 'dryRun' },
          { id: 'T-PA-02-02', args: ['--verbose'], field: 'verbose' },
        ];
        for (const { id, args, field } of _cases) {
          it(`${id}: ${args[0]} → ${field} が true になる`, () => {
            const result = parseArgsToConfig<TestConfig>(args, TEST_SCHEMA);
            assertEquals(result[field], true);
          });
        }
      });
    });
  });

  // ─── T-PA-03: キー付きオプション（スペース区切り） ───────────────────────

  describe('Given: キー付きオプション（スペース区切り）', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-03 - 対応フィールドに値が設定される', () => {
        it('T-PA-03-01: --output /out → outputDir が "/out" になる', () => {
          const result = parseArgsToConfig<TestConfig>(['--output', '/out'], TEST_SCHEMA);
          assertEquals(result.outputDir, '/out');
        });
      });
    });
  });

  // ─── T-PA-04: キー付きオプション（= 区切り） ─────────────────────────────

  describe('Given: キー付きオプション（= 区切り）', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-04 - 対応フィールドに値が設定される', () => {
        it('T-PA-04-01: --output=/out → outputDir が "/out" になる', () => {
          const result = parseArgsToConfig<TestConfig>(['--output=/out'], TEST_SCHEMA);
          assertEquals(result.outputDir, '/out');
        });
      });
    });
  });

  // ─── T-PA-05: 位置引数 — 期間文字列 ─────────────────────────────────────

  describe('Given: 期間形式の位置引数', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-05 - period に設定される', () => {
        it('T-PA-05-01: "2026-03" → period が "2026-03" になる', () => {
          const result = parseArgsToConfig<TestConfig>(['2026-03'], TEST_SCHEMA);
          assertEquals(result.period, '2026-03');
        });
        it('T-PA-05-02: "2026" → period が "2026" になる（年のみ指定）', () => {
          const result = parseArgsToConfig<TestConfig>(['2026'], TEST_SCHEMA);
          assertEquals(result.period, '2026');
        });
      });
    });
  });

  // ─── T-PA-06: 位置引数 — 既知エージェント ───────────────────────────────

  describe('Given: 既知エージェント名の位置引数', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-06 - agent に設定される', () => {
        const _cases: { id: string; agent: string }[] = [
          { id: 'T-PA-06-01', agent: 'claude' },
          { id: 'T-PA-06-02', agent: 'chatgpt' },
        ];
        for (const { id, agent } of _cases) {
          it(`${id}: "${agent}" → agent が "${agent}" になる`, () => {
            const result = parseArgsToConfig<TestConfig>([agent], TEST_SCHEMA);
            assertEquals(result.agent, agent);
          });
        }
      });
    });
  });

  // ─── T-PA-07: 位置引数 — ディレクトリパス ───────────────────────────────

  describe('Given: ディレクトリパスの位置引数', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-07 - chatlogsDir に設定される', () => {
        const _cases: { id: string; input: string; expected: string }[] = [
          { id: 'T-PA-07-01', input: '/absolute/path', expected: '/absolute/path' },
          { id: 'T-PA-07-02', input: './relative/path', expected: 'relative/path' },
          { id: 'T-PA-07-03', input: 'C:\\Windows\\path', expected: 'C:/Windows/path' },
        ];
        for (const { id, input, expected } of _cases) {
          it(`${id}: "${input}" → chatlogsDir が "${expected}" になる`, () => {
            const result = parseArgsToConfig<TestConfig>([input], TEST_SCHEMA);
            assertEquals(result.chatlogsDir, expected);
          });
        }
      });
    });
  });

  // ─── T-PA-08: 複数引数の組み合わせ ──────────────────────────────────────

  describe('Given: 複数引数の組み合わせ', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-08 - 全フィールドが正しく解析される', () => {
        it('T-PA-08-01: claude 2026-03 --dry-run --output ./out が全フィールドに設定される', () => {
          const result = parseArgsToConfig<TestConfig>(
            ['claude', '2026-03', '--dry-run', '--output', './out'],
            TEST_SCHEMA,
          );
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
          assertEquals(result.dryRun, true);
          assertEquals(result.outputDir, './out');
        });
        it('T-PA-08-02: --dry-run --output ./out → dryRun=true かつ outputDir="./out" になる', () => {
          const result = parseArgsToConfig<TestConfig>(
            ['--dry-run', '--output', './out'],
            TEST_SCHEMA,
          );
          assertEquals(result.dryRun, true);
          assertEquals(result.outputDir, './out');
        });
      });
    });
  });

  // ─── T-PA-09: 異常系 — 不明なオプション ─────────────────────────────────

  describe('Given: 不明な -- オプション', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-09 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PA-09-01: --unknown → ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgsToConfig<TestConfig>(['--unknown'], TEST_SCHEMA),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PA-10: 異常系 — 不明な位置引数 ───────────────────────────────────

  describe('Given: 不明な位置引数', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-10 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PA-10-01: "unknown-arg" → ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgsToConfig<TestConfig>(['unknown-arg'], TEST_SCHEMA),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PA-11: 異常系 — 値が不足するキー付きオプション ───────────────────

  describe('Given: 値なしのキー付きオプション', () => {
    describe('When: parseArgsToConfig(["--output"]) を呼び出す', () => {
      describe('Then: T-PA-11 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PA-11-01: --output のみ → ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgsToConfig<TestConfig>(['--output'], TEST_SCHEMA),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PA-12: 異常系 — = の後が空文字列 ─────────────────────────────────

  describe('Given: = の後が空文字列のキー付きオプション', () => {
    describe('When: parseArgsToConfig(["--output="]) を呼び出す', () => {
      describe('Then: T-PA-12 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PA-12-01: --output= → ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgsToConfig<TestConfig>(['--output='], TEST_SCHEMA),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PA-13: 異常系 — フラグに = 付きで渡された場合 ────────────────────

  describe('Given: フラグオプションに = 付きで値を渡す', () => {
    describe('When: parseArgsToConfig(["--dry-run=true"]) を呼び出す', () => {
      describe('Then: T-PA-13 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-PA-13-01: --dry-run=true → 不明なオプションとして ChatlogError がスローされる', () => {
          assertThrows(
            () => parseArgsToConfig<TestConfig>(['--dry-run=true'], TEST_SCHEMA),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-PA-14: 同一フィールドへの後勝ち上書き ────────────────────────────

  describe('Given: 同一オプションを2回渡す', () => {
    describe('When: parseArgsToConfig(["--output", "/a", "--output=/b"]) を呼び出す', () => {
      describe('Then: T-PA-14 - 後に指定した値で上書きされる', () => {
        it('T-PA-14-01: outputDir が "/b" になる（後勝ち）', () => {
          const result = parseArgsToConfig<TestConfig>(
            ['--output', '/a', '--output=/b'],
            TEST_SCHEMA,
          );
          assertEquals(result.outputDir, '/b');
        });
      });
    });
  });

  // ─── T-PA-15: 値位置にフラグ風文字列が来た場合 ──────────────────────────

  describe('Given: キー付きオプションの値位置に "--" で始まる文字列が来る', () => {
    describe('When: parseArgsToConfig(["--output", "--dry-run"]) を呼び出す', () => {
      describe('Then: T-PA-15 - "--dry-run" が outputDir の値として代入される', () => {
        it('T-PA-15-01: outputDir が "--dry-run" になり dryRun は undefined のまま', () => {
          const result = parseArgsToConfig<TestConfig>(
            ['--output', '--dry-run'],
            TEST_SCHEMA,
          );
          assertEquals(result.outputDir, '--dry-run');
          assertEquals(result.dryRun, undefined);
        });
      });
    });
  });

  // ─── T-PA-16: 位置引数の優先順位 ─────────────────────────────────────────

  describe('Given: エージェント名を含むディレクトリパスの位置引数', () => {
    describe('When: parseArgsToConfig(["./claude"]) を呼び出す', () => {
      describe('Then: T-PA-16 - ディレクトリパスとして chatlogsDir に設定される', () => {
        it('T-PA-16-01: "./claude" → agent ではなく chatlogsDir が "claude" になる（normalizePath で ./ が除去される）', () => {
          const result = parseArgsToConfig<TestConfig>(['./claude'], TEST_SCHEMA);
          assertEquals(result.chatlogsDir, 'claude');
          assertEquals(result.agent, undefined);
        });
      });
    });
  });

  // ─── T-PA-17: period 型バリデーション ───────────────────────────────────────

  /**
   * `parseArgsToConfig` の `period` 型バリデーションテスト。
   *
   * `--period` オプションに不正な形式の値を渡した場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   * 正常な YYYY-MM 形式は正常にセットされることも検証する。
   *
   * テスト ID 範囲: T-PA-17-01 〜 T-PA-17-02
   */
  describe('Given: --period オプションに不正な形式の値', () => {
    /** period 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_WITH_PERIOD: ArgsSchema = [
      { option: '--period', field: 'period', type: 'period' },
    ];

    describe('When: 異常系', () => {
      it('[Error] T-PA-17-01: --period invalid-format → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig>(['--period', 'invalid-format'], _SCHEMA_WITH_PERIOD),
          ChatlogError,
          'Invalid Args',
        );
      });
    });

    describe('When: 正常系', () => {
      it('[Normal] T-PA-17-02: --period 2026-03 → period が "2026-03" になる', () => {
        const result = parseArgsToConfig<TestConfig>(['--period', '2026-03'], _SCHEMA_WITH_PERIOD);
        assertEquals(result.period, '2026-03');
      });
    });
  });

  // ─── T-PA-18: chatlogsDir 形式バリデーション ──────────────────────────────

  /**
   * `parseArgsToConfig` の `chatlogsDir` 形式バリデーションテスト。
   *
   * オプション経由で `chatlogsDir` に非ディレクトリ形式の値が設定された場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-18-01 〜 T-PA-18-02
   */
  describe('Given: --chatlogs-dir オプションに非ディレクトリ形式の値', () => {
    type TestConfigWithChatlogsDir = TestConfig & { chatlogsDir?: string };

    /** 非ディレクトリ形式（スラッシュなし）の値を chatlogsDir に設定するケース。 */
    const _SCHEMA_WITH_CHATLOGS: ArgsSchema = [
      { option: '--output', field: 'outputDir', type: 'string' },
      { option: '--chatlogs-dir', field: 'chatlogsDir', type: 'directory' },
      { option: '--dry-run', field: 'dryRun', type: 'flag' },
      { option: '--verbose', field: 'verbose', type: 'flag' },
    ];

    describe('When: 異常系', () => {
      it('[Error] T-PA-18-01: --chatlogs-dir plain-value → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () =>
            parseArgsToConfig<TestConfigWithChatlogsDir>(
              ['--chatlogs-dir', 'plain-value'],
              _SCHEMA_WITH_CHATLOGS,
            ),
          ChatlogError,
          'Invalid Args',
        );
      });
    });

    /** chatlogsDir が未設定の場合はスローしない。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-PA-18-02: chatlogsDir 未設定 → スローしない', () => {
        const result = parseArgsToConfig<TestConfig>([], TEST_SCHEMA);
        assertEquals(result.chatlogsDir, undefined);
      });
    });
  });

  // ─── T-PA-19: 異常系 — agent 型に不明なエージェント名 ───────────────────────

  /**
   * `parseArgsToConfig` の `agent` 型バリデーションテスト。
   *
   * `--agent` オプションに未知のエージェント名を渡した場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-19-01
   */
  describe('Given: --agent オプションに不明なエージェント名', () => {
    /** agent 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_WITH_AGENT: ArgsSchema = [
      { option: '--agent', field: 'agent', type: 'agent' },
    ];

    describe('When: 異常系', () => {
      it('[Error] T-PA-19-01: --agent unknown-bot → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig>(['--agent', 'unknown-bot'], _SCHEMA_WITH_AGENT),
          ChatlogError,
          'Invalid Args',
        );
      });
    });
  });

  // ─── T-PA-20: 異常系 — integer 型に非数値 ────────────────────────────────

  /**
   * `parseArgsToConfig` の `integer` 型バリデーションテスト。
   *
   * `--limit` オプションに非数値文字列を渡した場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-20-01
   */
  describe('Given: --limit オプションに非数値の値', () => {
    /** integer 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_WITH_INTEGER: ArgsSchema = [
      { option: '--limit', field: 'limit', type: 'integer' },
    ];

    describe('When: 異常系', () => {
      it('[Error] T-PA-20-01: --limit abc → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig & { limit?: string }>(['--limit', 'abc'], _SCHEMA_WITH_INTEGER),
          ChatlogError,
          'Invalid Args',
        );
      });
    });
  });

  // ─── T-PA-21: 異常系 — number 型に非数値 ─────────────────────────────────

  /**
   * `parseArgsToConfig` の `number` 型バリデーションテスト。
   *
   * `--ratio` オプションに非数値文字列を渡した場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-21-01
   */
  describe('Given: --ratio オプションに非数値の値', () => {
    /** number 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_WITH_NUMBER: ArgsSchema = [
      { option: '--ratio', field: 'ratio', type: 'number' },
    ];

    describe('When: 異常系', () => {
      it('[Error] T-PA-21-01: --ratio xyz → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig & { ratio?: string }>(['--ratio', 'xyz'], _SCHEMA_WITH_NUMBER),
          ChatlogError,
          'Invalid Args',
        );
      });
    });
  });

  // ─── T-PA-23: integer 型オプションの正常解析 ──────────────────────────────

  /**
   * `parseArgsToConfig` の `integer` 型オプション正常解析テスト。
   *
   * `--chunk-size` オプションに整数値を渡した場合に数値として設定されることを検証する。
   *
   * テスト ID 範囲: T-PA-23-01 〜 T-PA-23-02
   */
  describe('Given: --chunk-size オプションに整数値', () => {
    /** integer 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_INT: ArgsSchema = [
      { option: '--chunk-size', field: 'chunkSize', type: 'integer' },
    ];

    type TestConfigWithChunkSize = TestConfig & { chunkSize?: number };

    describe('When: 正常系', () => {
      it('[Normal] T-PA-23-01: --chunk-size 5 → chunkSize が 5 になる', () => {
        const result = parseArgsToConfig<TestConfigWithChunkSize>(['--chunk-size', '5'], _SCHEMA_INT);
        assertEquals(result.chunkSize, 5);
      });
      it('[Normal] T-PA-23-02: --chunk-size 0 → chunkSize が 0 になる', () => {
        const result = parseArgsToConfig<TestConfigWithChunkSize>(['--chunk-size', '0'], _SCHEMA_INT);
        assertEquals(result.chunkSize, 0);
      });
    });
  });

  // ─── T-PA-24: number 型オプションの正常解析 ──────────────────────────────

  /**
   * `parseArgsToConfig` の `number` 型オプション正常解析テスト。
   *
   * `--threshold` オプションに浮動小数点値を渡した場合に数値として設定されることを検証する。
   *
   * テスト ID 範囲: T-PA-24-01
   */
  describe('Given: --threshold オプションに浮動小数点値', () => {
    /** number 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_NUM: ArgsSchema = [
      { option: '--threshold', field: 'threshold', type: 'number' },
    ];

    type TestConfigWithThreshold = TestConfig & { threshold?: number };

    describe('When: 正常系', () => {
      it('[Normal] T-PA-24-01: --threshold 0.8 → threshold が 0.8 になる', () => {
        const result = parseArgsToConfig<TestConfigWithThreshold>(['--threshold', '0.8'], _SCHEMA_NUM);
        assertEquals(result.threshold, 0.8);
      });
    });
  });

  // ─── T-PA-25: agent 型オプションの正常解析 ──────────────────────────────

  /**
   * `parseArgsToConfig` の `agent` 型オプション正常解析テスト。
   *
   * `--agent` オプションに既知エージェント名を渡した場合に正常にセットされることを検証する。
   *
   * テスト ID 範囲: T-PA-25-01 〜 T-PA-25-02
   */
  describe('Given: --agent オプションに既知エージェント名', () => {
    /** agent 型エントリを含むテスト用スキーマ。 */
    const _SCHEMA_AGENT: ArgsSchema = [
      { option: '--agent', field: 'agent', type: 'agent' },
    ];

    describe('When: 正常系', () => {
      it('[Normal] T-PA-25-01: --agent claude → agent が "claude" になる', () => {
        const result = parseArgsToConfig<TestConfig>(['--agent', 'claude'], _SCHEMA_AGENT);
        assertEquals(result.agent, 'claude');
      });
      it('[Normal] T-PA-25-02: --agent chatgpt → agent が "chatgpt" になる', () => {
        const result = parseArgsToConfig<TestConfig>(['--agent', 'chatgpt'], _SCHEMA_AGENT);
        assertEquals(result.agent, 'chatgpt');
      });
    });
  });

  // ─── T-PA-26: --no-<xx> でフラグが false になる ──────────────────────────

  /**
   * `parseArgsToConfig` の `--no-<xx>` フラグ否定テスト。
   *
   * `--no-` プレフィックスを持つ引数を渡した場合に、対応するフラグフィールドが
   * `false` に設定されることを検証する。
   *
   * テスト ID 範囲: T-PA-26-01 〜 T-PA-26-02
   */
  describe('Given: --no-<xx> フラグ否定引数', () => {
    /** --no- プレフィックスの正常系ケース。 */
    describe('When: 正常系', () => {
      it('[Normal] T-PA-26-01: --no-dry-run を渡すと dryRun: false がセットされる', () => {
        const result = parseArgsToConfig<TestConfig>(['--no-dry-run'], TEST_SCHEMA);
        assertEquals(result.dryRun, false);
      });
      it('[Normal] T-PA-26-02: --no-verbose を渡すと verbose: false がセットされる', () => {
        const result = parseArgsToConfig<TestConfig>(['--no-verbose'], TEST_SCHEMA);
        assertEquals(result.verbose, false);
      });
    });
  });

  // ─── T-PA-27: 既存フラグ動作の回帰確認 ─────────────────────────────────

  /**
   * `parseArgsToConfig` の既存フラグ動作回帰テスト。
   *
   * `--no-` 追加後も `--dry-run` が `true` をセットし続けることを検証する。
   *
   * テスト ID 範囲: T-PA-27-01 〜 T-PA-27-02
   */
  describe('Given: 既存フラグと --no- の混在', () => {
    /** 既存フラグ動作が変わっていないことを確認する正常系。 */
    describe('When: 正常系', () => {
      it('[Normal] T-PA-27-01: --dry-run → dryRun: true (既存動作変更なし)', () => {
        const result = parseArgsToConfig<TestConfig>(['--dry-run'], TEST_SCHEMA);
        assertEquals(result.dryRun, true);
      });
      it('[Normal] T-PA-27-02: --no-dry-run と --output の組み合わせ → 両フィールドが正しくセット', () => {
        const result = parseArgsToConfig<TestConfig>(['--no-dry-run', '--output', '/out'], TEST_SCHEMA);
        assertEquals(result.dryRun, false);
        assertEquals(result.outputDir, '/out');
      });
    });
  });

  // ─── T-PA-28: エッジケース — 後勝ち ────────────────────────────────────

  /**
   * `parseArgsToConfig` のフラグ否定後勝ちテスト。
   *
   * `--dry-run` と `--no-dry-run` を両方渡した場合、後に指定した値が優先されることを検証する。
   *
   * テスト ID 範囲: T-PA-28-01 〜 T-PA-28-02
   */
  describe('Given: --dry-run と --no-dry-run の両方を渡す', () => {
    /** 後勝ちのエッジケース。 */
    describe('When: エッジケース', () => {
      it('[Edge] T-PA-28-01: --dry-run --no-dry-run → dryRun: false (後が優先)', () => {
        const result = parseArgsToConfig<TestConfig>(['--dry-run', '--no-dry-run'], TEST_SCHEMA);
        assertEquals(result.dryRun, false);
      });
      it('[Edge] T-PA-28-02: --no-dry-run --dry-run → dryRun: true (後が優先)', () => {
        const result = parseArgsToConfig<TestConfig>(['--no-dry-run', '--dry-run'], TEST_SCHEMA);
        assertEquals(result.dryRun, true);
      });
    });
  });

  // ─── T-PA-29: 異常系 — スキーマなし / =値指定 ─────────────────────────

  /**
   * `parseArgsToConfig` の `--no-` プレフィックスエラーケーステスト。
   *
   * 対応するスキーマエントリが存在しない場合と `=値` を指定した場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-29-01 〜 T-PA-29-02
   */
  describe('Given: --no- プレフィックスのエラーケース', () => {
    /** スキーマなし・=値指定の異常系。 */
    describe('When: 異常系', () => {
      it('[Error] T-PA-29-01: --no-unknown → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig>(['--no-unknown'], TEST_SCHEMA),
          ChatlogError,
          'Invalid Args',
        );
      });
      it('[Error] T-PA-29-02: --no-dry-run=true → ChatlogError(InvalidArgs) がスローされる (=値指定不可)', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig>(['--no-dry-run=true'], TEST_SCHEMA),
          ChatlogError,
          'Invalid Args',
        );
      });
    });
  });

  // ─── T-PA-30: 異常系 — flag 以外に --no- を付けた場合 ──────────────────

  /**
   * `parseArgsToConfig` の `--no-` プレフィックスに非フラグオプションを指定するテスト。
   *
   * `string` 型など flag 以外のオプションに `--no-` を付けた場合に
   * `ChatlogError('InvalidArgs')` をスローすることを検証する。
   *
   * テスト ID 範囲: T-PA-30-01
   */
  describe('Given: flag 以外のオプションに --no- を付けた場合', () => {
    /** string 型オプションへの --no- 指定エラー。 */
    describe('When: 異常系', () => {
      it('[Error] T-PA-30-01: --no-output (string 型) → ChatlogError(InvalidArgs) がスローされる', () => {
        assertThrows(
          () => parseArgsToConfig<TestConfig>(['--no-output'], TEST_SCHEMA),
          ChatlogError,
          'Invalid Args',
        );
      });
    });
  });
});

// ─── isArgDirectory ──────────────────────────────────────────────────────────

describe('isArgDirectory', () => {
  describe('Given: スラッシュを含む Unix スタイルのパス', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-01 - true が返る', () => {
        it('T-LIB-U-11-01: /path/to/dir はディレクトリ引数として認識される', () => {
          assert(isArgDirectory('/path/to/dir'));
        });
      });
    });
  });

  describe('Given: スラッシュを含む相対パス', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-02 - true が返る', () => {
        it('T-LIB-U-11-02: ./chatlogs はディレクトリ引数として認識される', () => {
          assert(isArgDirectory('./chatlogs'));
        });
      });
    });
  });

  describe('Given: スラッシュを含まない単純な文字列', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-03 - false が返る', () => {
        it('T-LIB-U-11-03: claude はディレクトリ引数として認識されない', () => {
          assertFalse(isArgDirectory('claude'));
        });
      });
    });
  });

  describe('Given: バックスラッシュパス（Windows 形式）', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-04 - normalizePath 後にスラッシュを含むので true が返る', () => {
        it('T-LIB-U-11-04: C:\\Users\\foo はスラッシュ正規化後にディレクトリ引数として認識される', () => {
          assert(isArgDirectory('C:\\Users\\foo'));
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-05 - false が返る', () => {
        it('T-LIB-U-11-05: 空文字列はディレクトリ引数として認識されない', () => {
          assertFalse(isArgDirectory(''));
        });
      });
    });
  });
});

// ─── isArgPeriod ─────────────────────────────────────────────────────────────

/**
 * `isArgPeriod` のユニットテストスイート。
 *
 * `YYYY-MM` または `YYYY` 形式の文字列を期間引数として認識するかを検証する。
 * 月レンジ（01〜12）は検証しない（現行の振る舞い保存）。
 *
 * テスト ID 範囲: T-LIB-U-12-01 〜 T-LIB-U-12-06
 *
 * @see isArgPeriod
 */
describe('isArgPeriod', () => {
  /** `YYYY-MM` または `YYYY` 形式として正常に認識されるケース。 */
  describe('When: 正常系', () => {
    it('[Normal] T-LIB-U-12-01: "2026-03" → true が返る', () => {
      assert(isArgPeriod('2026-03'));
    });
    it('[Normal] T-LIB-U-12-02: "2026" → true が返る（年のみ指定）', () => {
      assert(isArgPeriod('2026'));
    });
    it('[Normal] T-LIB-U-12-03: "not-a-date" → false が返る', () => {
      assertFalse(isArgPeriod('not-a-date'));
    });
  });

  /** 境界値・特殊入力のケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-U-12-04: "" → false が返る（空文字列）', () => {
      assertFalse(isArgPeriod(''));
    });
    it('[Edge] T-LIB-U-12-05: "2025-13" → true が返る（月レンジ非チェック、現行と同一）', () => {
      assert(isArgPeriod('2025-13'));
    });
    it('[Edge] T-LIB-U-12-06: "20260" → false が返る（5桁年は不一致）', () => {
      assertFalse(isArgPeriod('20260'));
    });
  });
});
