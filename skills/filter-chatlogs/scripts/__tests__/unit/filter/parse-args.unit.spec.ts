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
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../../filter-chatlogs.ts';

// ─── Helpers
// classes
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// types
import type { FilterParsedConfig } from '../../../types/filter.types.ts';

// ─── Internal Helpers

// types
type Args = FilterParsedConfig;

// ─── Tests

describe('parseArgs', () => {
  // ─── T-FL-PA-01: デフォルト値 ───────────────────────────────────────────────

  describe('Given: 引数なしの空配列', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-FL-PA-01 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-01-01', field: 'agent', expected: undefined },
          { id: 'T-FL-PA-01-02', field: 'dryRun', expected: undefined },
          { id: 'T-FL-PA-01-03', field: 'baseDir', expected: undefined },
          { id: 'T-FL-PA-01-04', field: 'period', expected: undefined },
          { id: 'T-FL-PA-01-05', field: 'chatlogsDir', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([])[field], expected);
          });
        }
      });
    });
  });

  // ─── T-FL-PA-02〜07: 単一オプション ──────────────────────────────────────────

  describe('Given: 単一オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof Args; expected: unknown }[] = [
          { id: 'T-FL-PA-02-01', args: ['chatgpt'], field: 'agent', expected: 'chatgpt' },
          { id: 'T-FL-PA-03-01', args: ['2026-03'], field: 'period', expected: '2026-03' },
          { id: 'T-FL-PA-05-01', args: ['--dry-run'], field: 'dryRun', expected: true },
          { id: 'T-FL-PA-06-01', args: ['--base-dir', '/path/to/base'], field: 'baseDir', expected: '/path/to/base' },
          { id: 'T-FL-PA-07-01', args: ['--base-dir=/path/to/base'], field: 'baseDir', expected: '/path/to/base' },
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

  describe('Given: claude 2026-03 --dry-run --base-dir /base を渡す', () => {
    it('T-FL-PA-08-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(['claude', '2026-03', '--dry-run', '--base-dir', '/base']);
      assertEquals(result.agent, 'claude');
      assertEquals(result.period, '2026-03');
      assert(result.dryRun);
      assertEquals(result.baseDir, '/base');
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

  // ─── T-FL-PA-11: --chatlogs-dir オプション ───────────────────────────────────

  describe('Given: --chatlogs-dir オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir フィールドに値が設定される', () => {
        it('T-FL-PA-11-01: --chatlogs-dir /base → chatlogsDir が "/base" になる', () => {
          assertEquals(parseArgs(['--chatlogs-dir', '/base']).chatlogsDir, '/base');
        });

        it('T-FL-PA-11-02: --chatlogs-dir=/base → chatlogsDir が "/base" になる', () => {
          assertEquals(parseArgs(['--chatlogs-dir=/base']).chatlogsDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-12: --chatlogs-dir と --base-dir の組み合わせ ──────────────────────

  describe('Given: --chatlogs-dir と --base-dir の両方が渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 両フィールドに別々の値が設定される', () => {
        it('T-FL-PA-12-01: --chatlogs-dir と --base-dir が同時指定できる', () => {
          const result = parseArgs(['--chatlogs-dir', '/logs', '--base-dir', '/base']);
          assertEquals(result.chatlogsDir, '/logs');
          assertEquals(result.baseDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-13: 全オプション組み合わせ ─────────────────────────────────────

  describe('Given: claude 2026-03 --dry-run --chatlogs-dir /base を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: 全フィールドが正しく解析される', () => {
        it('T-FL-PA-13-01: 全フィールドが正しく解析される', () => {
          const result = parseArgs(['claude', '2026-03', '--dry-run', '--chatlogs-dir', '/base']);
          assertEquals(result.agent, 'claude');
          assertEquals(result.period, '2026-03');
          assert(result.dryRun);
          assertEquals(result.chatlogsDir, '/base');
        });
        it('T-FL-PA-13-02: chatlogsDir=/base のとき baseDir が undefined', () => {
          const result = parseArgs(['claude', '2026-03', '--dry-run', '--chatlogs-dir', '/base']);
          assertEquals(result.baseDir, undefined);
        });
      });
    });
  });

  // ─── T-FL-PA-14: --chatlogs-dir バリデーション ───────────────────────────────

  /**
   * `--chatlogs-dir` にディレクトリパスでない値を渡した場合の異常系グループ。
   *
   * ディレクトリパス（`/` を含む正規化済みパス）でない値は `ChatlogError(InvalidArgs)` をスローする。
   */
  describe('Given: --chatlogs-dir にディレクトリパスでない値を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-FL-PA-14-01: --chatlogs-dir foo（スラッシュなし）→ ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => parseArgs(['--chatlogs-dir', 'foo']),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });

  // ─── T-FL-PA-15: --base-dir オプション ──────────────────────────────────────

  /**
   * `--base-dir` オプションが `baseDir` フィールドに設定されることを検証するグループ。
   */
  describe('Given: --base-dir オプションが渡される', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: baseDir フィールドに値が設定される', () => {
        it('T-FL-PA-15-01: --base-dir /base → baseDir が "/base" になる', () => {
          assertEquals(parseArgs(['--base-dir', '/base']).baseDir, '/base');
        });
        it('T-FL-PA-15-02: --base-dir=/base → baseDir が "/base" になる', () => {
          assertEquals(parseArgs(['--base-dir=/base']).baseDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-16: --chatlogs-dir も --base-dir も未指定 ─────────────────────────

  /**
   * `--chatlogs-dir` も `--base-dir` も未指定のとき両フィールドが `undefined` になることを検証するグループ。
   */
  describe('Given: --chatlogs-dir も --base-dir も未指定', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: chatlogsDir と baseDir が undefined になる', () => {
        it('T-FL-PA-16-01: 引数なし → chatlogsDir が undefined になる', () => {
          assertEquals(parseArgs([]).chatlogsDir, undefined);
        });
        it('T-FL-PA-16-02: 引数なし → baseDir が undefined になる', () => {
          assertEquals(parseArgs([]).baseDir, undefined);
        });
      });
    });
  });

  // ─── T-FL-PA-17: --chatlogs-dir 指定時に baseDir は undefined ────────────────

  /**
   * `--chatlogs-dir` のみ指定したとき `baseDir` が `undefined` のままであることを検証するグループ。
   *
   * `chatlogsDir` が指定されても `baseDir` は独立したフィールドであり、
   * `--base-dir` を渡さない限り `undefined` になる。
   */
  describe('Given: --chatlogs-dir が指定されて --base-dir が未指定', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: T-FL-PA-17 - baseDir が undefined のまま', () => {
        it('T-FL-PA-17-01: --chatlogs-dir /base → baseDir が undefined', () => {
          assertEquals(parseArgs(['--chatlogs-dir', '/base']).baseDir, undefined);
        });
        it('T-FL-PA-17-02: --chatlogs-dir /base → chatlogsDir が "/base"', () => {
          assertEquals(parseArgs(['--chatlogs-dir', '/base']).chatlogsDir, '/base');
        });
      });
    });
  });

  // ─── T-FL-PA-18: --base-dir バリデーション ──────────────────────────────────

  /**
   * `--base-dir` にディレクトリパスでない値を渡した場合の異常系グループ。
   *
   * ディレクトリパス（`/` を含む）でない値は `ChatlogError(InvalidArgs)` をスローする。
   */
  describe('Given: --base-dir にディレクトリパスでない値を渡す', () => {
    describe('When: parseArgs を呼び出す', () => {
      describe('Then: T-FL-PA-18 - ChatlogError(InvalidArgs) がスローされる', () => {
        it('T-FL-PA-18-01: --base-dir foo（スラッシュなし）→ ChatlogError(InvalidArgs) がスローされる', () => {
          assertThrows(
            () => parseArgs(['--base-dir', 'foo']),
            ChatlogError,
            'Invalid Args',
          );
        });
      });
    });
  });
});
