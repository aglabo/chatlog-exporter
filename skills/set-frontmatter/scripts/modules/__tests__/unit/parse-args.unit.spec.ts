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
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { parseArgs } from '../../setfm-config.ts';

// ─── Helpers
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';

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
  // ─── T-SF-PA-01: デフォルト値 ────────────────────────────────────────────────

  /**
   * `--output-dir` のみ指定した場合のデフォルト値テスト。
   *
   * 省略可能なオプションが未指定のとき undefined になることを検証する。
   */
  describe('Given: 最小引数 ["--output-dir", "/path/to/dir"]', () => {
    describe('When: parseArgs(["--output-dir", "/path/to/dir"]) を呼び出す', () => {
      /** `--output-dir` のみ指定した場合の各フィールドのデフォルト値。 */
      describe('Then: T-SF-PA-01 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof ParsedResult; expected: unknown }[] = [
          { id: 'T-SF-PA-01-01', field: 'outputDir', expected: _PATH },
          { id: 'T-SF-PA-01-02', field: 'dicsDir', expected: undefined },
          { id: 'T-SF-PA-01-03', field: 'dryRun', expected: undefined },
          { id: 'T-SF-PA-01-04', field: 'review', expected: undefined },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([_TARGET, _PATH])[field], expected);
          });
        }
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
});
