// src: scripts/modules/__tests__/unit/parse-args.unit.spec.ts
// @(#): parseArgs のユニットテスト
//       CLI 引数解析: デフォルト値・各オプション・エラー終了
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words setfm

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../setfm-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
import { GlobalConfig } from '../../../../../_scripts/classes/GlobalConfig.class.ts';
// constants
import { DEFAULT_DICS_DIR } from '../../../../../_scripts/constants/defaults.constants.ts';

// ─── Internal Helpers

// types
type ParsedResult = ReturnType<typeof parseArgs>;

// constants
const _TARGET = '--output-dir';
const _PATH = '/path/to/dir';

// ─── Tests

/**
 * `parseArgs` のユニットテストスイート。
 *
 * CLI 引数の解析: `--output-dir`・`--dics`・`--dry-run`・`--review`・`--config` オプション。
 *
 * テスト ID 範囲: T-SF-PA-01 〜 T-SF-PA-11
 *
 * @see parseArgs
 */
describe('parseArgs', () => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
  });

  // ─── T-SF-PA-01: デフォルト値 ────────────────────────────────────────────────

  /**
   * `--output-dir` のみ指定した場合のデフォルト値テスト。
   *
   * 省略可能なオプションが未指定のとき undefined になることを検証する。
   * ただし GlobalConfig が管理するフィールド（dicsDir）はデフォルト値が自動マージされる。
   */
  describe('Given: 最小引数 ["--output-dir", "/path/to/dir"]', () => {
    describe('When: parseArgs(["--output-dir", "/path/to/dir"]) を呼び出す', () => {
      /** `--output-dir` のみ指定した場合の各フィールドのデフォルト値。 */
      describe('Then: T-SF-PA-01 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof ParsedResult; expected: unknown }[] = [
          { id: 'T-SF-PA-01-01', field: 'outputDir', expected: _PATH },
          { id: 'T-SF-PA-01-03', field: 'dryRun', expected: undefined },
          { id: 'T-SF-PA-01-04', field: 'review', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([_TARGET, _PATH])[field], expected);
          });
        }

        it('T-SF-PA-01-02: dicsDir が GlobalConfig のデフォルト値になる', () => {
          assertEquals(parseArgs([_TARGET, _PATH]).dicsDir, DEFAULT_DICS_DIR);
        });
      });
    });
  });

  // ─── T-SF-PA-02〜05: 単一オプション ──────────────────────────────────────────

  /**
   * 各オプションを単独で指定した場合の解析テスト。
   */
  describe('Given: 単一オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      /** 対応フィールドに値が設定されることを検証する。 */
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof ParsedResult; expected: unknown }[] = [
          { id: 'T-SF-PA-02-01', args: [_TARGET, '/path', '--dry-run'], field: 'dryRun', expected: true },
          { id: 'T-SF-PA-03-01', args: [_TARGET, '/path', '--review'], field: 'review', expected: true },
          { id: 'T-SF-PA-04-01', args: [_TARGET, '/path', '--dics', '/dics'], field: 'dicsDir', expected: '/dics' },
          { id: 'T-SF-PA-05-01', args: [_TARGET, '/path', '--dics=/dics'], field: 'dicsDir', expected: '/dics' },
        ];
        for (const { id, args, field, expected } of _cases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(args)[field], expected);
          });
        }
      });
    });
  });

  // ─── T-SF-PA-09: 複数オプション組み合わせ ────────────────────────────────────

  it('T-SF-PA-09-01: 全フィールドが正しく解析される', () => {
    const result = parseArgs([_TARGET, _PATH, '--dry-run', '--review', '--dics', '/dics', '--config', 'cfg.yaml']);
    assertEquals(result.outputDir, _PATH);
    assertEquals(result.dryRun, true);
    assertEquals(result.review, true);
    assertEquals(result.dicsDir, '/dics');
    assertEquals(result.configFile, 'cfg.yaml');
  });

  // ─── 異常系: ChatlogError がスローされる ──────────────────────────────────────

  /**
   * 不正な引数を渡したときのエラーテスト。
   */
  describe('Given: 不正な引数', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      /** `ChatlogError(InvalidArgs)` がスローされることを検証する。 */
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        const _errorCases: { id: string; args: string[]; label: string }[] = [
          { id: 'T-SF-PA-11-01', args: ['--unknown'], label: '未知オプション' },
        ];
        for (const { id, args, label } of _errorCases) {
          it(`${id}: ${label} → ChatlogError(InvalidArgs) がスローされる`, () => {
            assertThrows(
              () => parseArgs(args),
              ChatlogError,
              'Invalid Args',
            );
          });
        }
      });
    });
  });

  // ─── T-SF-PA-12: --concurrency オプション ────────────────────────────────────

  /**
   * `--concurrency` オプションの解析テスト。
   *
   * 正常系: 整数値が parsed.concurrency に設定される。
   * 異常系: 非数値・値なしで ChatlogError がスローされる。
   */
  describe('Given: --concurrency オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      /** 正常系: 整数値が設定される。 */
      describe('Then: 正常系 - concurrency が設定される', () => {
        const _cases = [
          { id: 'T-SF-PA-12-01', args: ['--output-dir', '/path', '--concurrency', '4'], expected: 4 },
          { id: 'T-SF-PA-12-02', args: ['--output-dir', '/path', '--concurrency', '1'], expected: 1 },
        ] as const;
        for (const { id, args, expected } of _cases) {
          it(`[Normal] ${id}: --concurrency ${expected} → concurrency=${expected}`, () => {
            assertEquals(parseArgs([...args]).concurrency, expected);
          });
        }
      });

      /** 正常系: 未指定のとき GlobalConfig のデフォルト値になる。 */
      describe('Then: 正常系 - --concurrency 未指定', () => {
        it('[Normal] T-SF-PA-12-03: --concurrency 未指定 → GlobalConfig のデフォルト値 4 になる', () => {
          assertEquals(parseArgs(['--output-dir', '/path']).concurrency, 4);
        });
      });

      /** 異常系: ChatlogError がスローされる。 */
      describe('Then: 異常系 - ChatlogError がスローされる', () => {
        const _errorCases = [
          { id: 'T-SF-PA-12-04', args: ['--output-dir', '/path', '--concurrency', 'abc'], label: '非数値' },
          { id: 'T-SF-PA-12-05', args: ['--output-dir', '/path', '--concurrency'], label: '値なし（引数末尾）' },
        ] as const;
        for (const { id, args, label } of _errorCases) {
          it(`[Error] ${id}: --concurrency ${label} → ChatlogError(InvalidArgs)`, () => {
            assertThrows(() => parseArgs(args as unknown as string[]), ChatlogError);
          });
        }
      });
    });
  });

  // ─── T-SF-PA-13: agent/period 位置引数 ──────────────────────────────────────

  /**
   * 位置引数（デフォルトスキーマ由来）の agent/period の解析テスト。
   */
  describe('Given: agent/period 位置引数', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      /** 正常系: 位置引数が対応フィールドに設定される。 */
      describe('Then: 正常系 - 対応フィールドに値が設定される', () => {
        const _cases = [
          { id: 'T-SF-PA-13-01', args: ['claude'], field: 'agent', expected: 'claude' },
        ] as const;
        for (const { id, args, field, expected } of _cases) {
          it(`[Normal] ${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([...args])[field], expected);
          });
        }
      });

      /** 異常系: period のみの位置引数（agent 省略）は不明な引数としてエラーになる。 */
      describe('Then: 異常系 - period 単独指定（agent 省略）は ChatlogError(InvalidArgs)', () => {
        it('[Error] T-SF-PA-13-02: ["2026-01"] → ChatlogError(InvalidArgs)', () => {
          assertThrows(
            () => parseArgs(['2026-01']),
            ChatlogError,
          );
        });
      });

      /** 正常系: 未指定のとき、GlobalConfig が管理しないフィールドは undefined になる。 */
      describe('Then: 正常系 - 未指定時は undefined', () => {
        const _cases = [
          { id: 'T-SF-PA-13-06', field: 'period' },
        ] as const;
        for (const { id, field } of _cases) {
          it(`[Normal] ${id}: ${field} 未指定 → undefined`, () => {
            assertEquals(parseArgs([])[field], undefined);
          });
        }

        it('[Normal] T-SF-PA-13-05: agent 未指定 → GlobalConfig のデフォルト値 "claude" になる', () => {
          assertEquals(parseArgs([]).agent, 'claude');
        });
      });
    });
  });
});
