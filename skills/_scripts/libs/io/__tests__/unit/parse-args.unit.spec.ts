// src: skills/_scripts/__tests__/unit/parse-args.unit.spec.ts
// @(#): parseArgsToConfig のユニットテスト
//       オプション解析・フラグ解析・位置引数解析・エラー処理

// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- classes --
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// -- test target --
import { isDirectoryArg, parseArgsToConfig } from '../../parse-args.ts';

// ─── テスト用 Config 型 ─────────────────────────────────────────────────────

type TestConfig = {
  agent?: string;
  period?: string;
  inputDir?: string;
  outputDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
};

const OPT_KEYS: Record<string, keyof TestConfig> = {
  '--output': 'outputDir',
};

const OPT_FLAGS: Record<string, keyof TestConfig> = {
  '--dry-run': 'dryRun',
  '--verbose': 'verbose',
};

// ─── T-PA-01: 空配列 → 全フィールド undefined ─────────────────────────────

describe('parseArgsToConfig', () => {
  describe('Given: 空の引数配列', () => {
    describe('When: parseArgsToConfig([]) を呼び出す', () => {
      describe('Then: T-PA-01 - 全フィールドが undefined', () => {
        const _cases: { id: string; field: keyof TestConfig }[] = [
          { id: 'T-PA-01-01', field: 'agent' },
          { id: 'T-PA-01-02', field: 'period' },
          { id: 'T-PA-01-03', field: 'inputDir' },
          { id: 'T-PA-01-04', field: 'outputDir' },
          { id: 'T-PA-01-05', field: 'dryRun' },
          { id: 'T-PA-01-06', field: 'verbose' },
        ];
        for (const { id, field } of _cases) {
          it(`${id}: ${field} が undefined になる`, () => {
            const result = parseArgsToConfig<TestConfig>([], OPT_KEYS, OPT_FLAGS);
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
            const result = parseArgsToConfig<TestConfig>(args, OPT_KEYS, OPT_FLAGS);
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
          const result = parseArgsToConfig<TestConfig>(['--output', '/out'], OPT_KEYS, OPT_FLAGS);
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
          const result = parseArgsToConfig<TestConfig>(['--output=/out'], OPT_KEYS, OPT_FLAGS);
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
          const result = parseArgsToConfig<TestConfig>(['2026-03'], OPT_KEYS, OPT_FLAGS);
          assertEquals(result.period, '2026-03');
        });
        it('T-PA-05-02: "2026" → period が "2026" になる（年のみ指定）', () => {
          const result = parseArgsToConfig<TestConfig>(['2026'], OPT_KEYS, OPT_FLAGS);
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
            const result = parseArgsToConfig<TestConfig>([agent], OPT_KEYS, OPT_FLAGS);
            assertEquals(result.agent, agent);
          });
        }
      });
    });
  });

  // ─── T-PA-07: 位置引数 — ディレクトリパス ───────────────────────────────

  describe('Given: ディレクトリパスの位置引数', () => {
    describe('When: parseArgsToConfig(args) を呼び出す', () => {
      describe('Then: T-PA-07 - inputDir に設定される', () => {
        const _cases: { id: string; input: string; expected: string }[] = [
          { id: 'T-PA-07-01', input: '/absolute/path', expected: '/absolute/path' },
          { id: 'T-PA-07-02', input: './relative/path', expected: './relative/path' },
          { id: 'T-PA-07-03', input: 'C:\\Windows\\path', expected: 'C:/Windows/path' },
        ];
        for (const { id, input, expected } of _cases) {
          it(`${id}: "${input}" → inputDir が "${expected}" になる`, () => {
            const result = parseArgsToConfig<TestConfig>([input], OPT_KEYS, OPT_FLAGS);
            assertEquals(result.inputDir, expected);
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
            OPT_KEYS,
            OPT_FLAGS,
          );
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
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
            () => parseArgsToConfig<TestConfig>(['--unknown'], OPT_KEYS, OPT_FLAGS),
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
            () => parseArgsToConfig<TestConfig>(['unknown-arg'], OPT_KEYS, OPT_FLAGS),
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
            () => parseArgsToConfig<TestConfig>(['--output'], OPT_KEYS, OPT_FLAGS),
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
            () => parseArgsToConfig<TestConfig>(['--output='], OPT_KEYS, OPT_FLAGS),
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
            () => parseArgsToConfig<TestConfig>(['--dry-run=true'], OPT_KEYS, OPT_FLAGS),
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
            OPT_KEYS,
            OPT_FLAGS,
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
            OPT_KEYS,
            OPT_FLAGS,
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
      describe('Then: T-PA-16 - ディレクトリパスとして inputDir に設定される', () => {
        it('T-PA-16-01: "./claude" → agent ではなく inputDir が "./claude" になる', () => {
          const result = parseArgsToConfig<TestConfig>(['./claude'], OPT_KEYS, OPT_FLAGS);
          assertEquals(result.inputDir, './claude');
          assertEquals(result.agent, undefined);
        });
      });
    });
  });
});

// ─── isDirectoryArg ──────────────────────────────────────────────────────────

describe('isDirectoryArg', () => {
  describe('Given: スラッシュを含む Unix スタイルのパス', () => {
    describe('When: isDirectoryArg を実行する', () => {
      describe('Then: T-LIB-U-11-01 - true が返る', () => {
        it('T-LIB-U-11-01: /path/to/dir はディレクトリ引数として認識される', () => {
          assertEquals(isDirectoryArg('/path/to/dir'), true);
        });
      });
    });
  });

  describe('Given: スラッシュを含む相対パス', () => {
    describe('When: isDirectoryArg を実行する', () => {
      describe('Then: T-LIB-U-11-02 - true が返る', () => {
        it('T-LIB-U-11-02: ./temp/chatlog はディレクトリ引数として認識される', () => {
          assertEquals(isDirectoryArg('./temp/chatlog'), true);
        });
      });
    });
  });

  describe('Given: スラッシュを含まない単純な文字列', () => {
    describe('When: isDirectoryArg を実行する', () => {
      describe('Then: T-LIB-U-11-03 - false が返る', () => {
        it('T-LIB-U-11-03: claude はディレクトリ引数として認識されない', () => {
          assertEquals(isDirectoryArg('claude'), false);
        });
      });
    });
  });

  describe('Given: バックスラッシュパス（Windows 形式）', () => {
    describe('When: isDirectoryArg を実行する', () => {
      describe('Then: T-LIB-U-11-04 - normalizePath 後にスラッシュを含むので true が返る', () => {
        it('T-LIB-U-11-04: C:\\Users\\foo はスラッシュ正規化後にディレクトリ引数として認識される', () => {
          assertEquals(isDirectoryArg('C:\\Users\\foo'), true);
        });
      });
    });
  });

  describe('Given: 空文字列', () => {
    describe('When: isDirectoryArg を実行する', () => {
      describe('Then: T-LIB-U-11-05 - false が返る', () => {
        it('T-LIB-U-11-05: 空文字列はディレクトリ引数として認識されない', () => {
          assertEquals(isDirectoryArg(''), false);
        });
      });
    });
  });
});
