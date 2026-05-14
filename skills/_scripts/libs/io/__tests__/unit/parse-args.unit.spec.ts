// src: skills/_scripts/__tests__/unit/parse-args.unit.spec.ts
// @(#): parseArgsToConfig のユニットテスト
//       オプション解析・フラグ解析・位置引数解析・エラー処理

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { _initSchemaForTest, isArgDirectory, isArgPeriod, parseArgsToConfig } from '../../parse-args.ts';

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
      assertEquals(_map.has('period'), true);
      assertEquals(_map.has('agent'), true);
      assertEquals(_map.has('chatlogsDir'), true);
    });
    it('[Normal] T-PA-22-02: 追加スキーマあり → デフォルト＋追加エントリを含む Map が返る', () => {
      const _map = _initSchemaForTest([{ option: '--output', field: 'outputDir', type: 'string' }]);
      assertEquals(_map.has('--output'), true);
      assertEquals(_map.has('period'), true);
    });
    it('[Normal] T-PA-22-03: flag 型エントリが正しく含まれる', () => {
      const _map = _initSchemaForTest([{ option: '--dry-run', field: 'dryRun', type: 'flag' }]);
      assertEquals(_map.get('--dry-run')?.type, 'flag');
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
          { id: 'T-PA-07-02', input: './relative/path', expected: './relative/path' },
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

        it('T-PA-09-01-sub: err.subindex が "Option" になる', () => {
          const err = assertThrows(
            () => parseArgsToConfig<TestConfig>(['--unknown'], TEST_SCHEMA),
            ChatlogError,
          );
          assertEquals(err.kind, 'InvalidArgs');
          assertEquals(err.subindex, 'UnknownOption');
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

        it('T-PA-10-01-sub: err.subindex が "Positional" になる', () => {
          const err = assertThrows(
            () => parseArgsToConfig<TestConfig>(['unknown-arg'], TEST_SCHEMA),
            ChatlogError,
          );
          assertEquals(err.kind, 'InvalidArgs');
          assertEquals(err.subindex, 'UnknownPositionalParameter');
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

        it('T-PA-11-01-sub: err.subindex が "Value" になる', () => {
          const err = assertThrows(
            () => parseArgsToConfig<TestConfig>(['--output'], TEST_SCHEMA),
            ChatlogError,
          );
          assertEquals(err.kind, 'InvalidArgs');
          assertEquals(err.subindex, 'NullValue');
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

        it('T-PA-12-01-sub: err.subindex が "Value" になる', () => {
          const err = assertThrows(
            () => parseArgsToConfig<TestConfig>(['--output='], TEST_SCHEMA),
            ChatlogError,
          );
          assertEquals(err.kind, 'InvalidArgs');
          assertEquals(err.subindex, 'NullValue');
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

        it('T-PA-13-01-sub: err.subindex が "Flag" になる', () => {
          const err = assertThrows(
            () => parseArgsToConfig<TestConfig>(['--dry-run=true'], TEST_SCHEMA),
            ChatlogError,
          );
          assertEquals(err.kind, 'InvalidArgs');
          assertEquals(err.subindex, 'FlagCannotSetValue');
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
        it('T-PA-16-01: "./claude" → agent ではなく chatlogsDir が "./claude" になる', () => {
          const result = parseArgsToConfig<TestConfig>(['./claude'], TEST_SCHEMA);
          assertEquals(result.chatlogsDir, './claude');
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

      it('[Error] T-PA-17-01-sub: err.subindex が "Period" になる', () => {
        const err = assertThrows(
          () => parseArgsToConfig<TestConfig>(['--period', 'invalid-format'], _SCHEMA_WITH_PERIOD),
          ChatlogError,
        );
        assertEquals(err.kind, 'InvalidArgs');
        assertEquals(err.subindex, 'IsNotPeriod');
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

      it('[Error] T-PA-18-01-sub: err.subindex が "Directory" になる', () => {
        const err = assertThrows(
          () => parseArgsToConfig<TestConfigWithChatlogsDir>(['--chatlogs-dir', 'plain-value'], _SCHEMA_WITH_CHATLOGS),
          ChatlogError,
        );
        assertEquals(err.kind, 'InvalidArgs');
        assertEquals(err.subindex, 'IsNotDirectory');
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

      it('[Error] T-PA-19-01-sub: err.subindex が "Agent" になる', () => {
        const err = assertThrows(
          () => parseArgsToConfig<TestConfig>(['--agent', 'unknown-bot'], _SCHEMA_WITH_AGENT),
          ChatlogError,
        );
        assertEquals(err.kind, 'InvalidArgs');
        assertEquals(err.subindex, 'UnknownAgent');
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

      it('[Error] T-PA-20-01-sub: err.subindex が "Integer" になる', () => {
        const err = assertThrows(
          () => parseArgsToConfig<TestConfig & { limit?: string }>(['--limit', 'abc'], _SCHEMA_WITH_INTEGER),
          ChatlogError,
        );
        assertEquals(err.kind, 'InvalidArgs');
        assertEquals(err.subindex, 'IsNotInteger');
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

      it('[Error] T-PA-21-01-sub: err.subindex が "Number" になる', () => {
        const err = assertThrows(
          () => parseArgsToConfig<TestConfig & { ratio?: string }>(['--ratio', 'xyz'], _SCHEMA_WITH_NUMBER),
          ChatlogError,
        );
        assertEquals(err.kind, 'InvalidArgs');
        assertEquals(err.subindex, 'IsNotNumber');
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
          assertEquals(isArgDirectory('/path/to/dir'), true);
        });
      });
    });
  });

  describe('Given: スラッシュを含む相対パス', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-02 - true が返る', () => {
        it('T-LIB-U-11-02: ./chatlogs はディレクトリ引数として認識される', () => {
          assertEquals(isArgDirectory('./chatlogs'), true);
        });
      });
    });
  });

  describe('Given: スラッシュを含まない単純な文字列', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-03 - false が返る', () => {
        it('T-LIB-U-11-03: claude はディレクトリ引数として認識されない', () => {
          assertEquals(isArgDirectory('claude'), false);
        });
      });
    });
  });

  describe('Given: バックスラッシュパス（Windows 形式）', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-04 - normalizePath 後にスラッシュを含むので true が返る', () => {
        it('T-LIB-U-11-04: C:\\Users\\foo はスラッシュ正規化後にディレクトリ引数として認識される', () => {
          assertEquals(isArgDirectory('C:\\Users\\foo'), true);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isArgDirectory を実行する', () => {
      describe('Then: T-LIB-U-11-05 - false が返る', () => {
        it('T-LIB-U-11-05: 空文字列はディレクトリ引数として認識されない', () => {
          assertEquals(isArgDirectory(''), false);
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
      assertEquals(isArgPeriod('2026-03'), true);
    });
    it('[Normal] T-LIB-U-12-02: "2026" → true が返る（年のみ指定）', () => {
      assertEquals(isArgPeriod('2026'), true);
    });
    it('[Normal] T-LIB-U-12-03: "not-a-date" → false が返る', () => {
      assertEquals(isArgPeriod('not-a-date'), false);
    });
  });

  /** 境界値・特殊入力のケース。 */
  describe('When: エッジケース', () => {
    it('[Edge] T-LIB-U-12-04: "" → false が返る（空文字列）', () => {
      assertEquals(isArgPeriod(''), false);
    });
    it('[Edge] T-LIB-U-12-05: "2025-13" → true が返る（月レンジ非チェック、現行と同一）', () => {
      assertEquals(isArgPeriod('2025-13'), true);
    });
    it('[Edge] T-LIB-U-12-06: "20260" → false が返る（5桁年は不一致）', () => {
      assertEquals(isArgPeriod('20260'), false);
    });
  });
});
