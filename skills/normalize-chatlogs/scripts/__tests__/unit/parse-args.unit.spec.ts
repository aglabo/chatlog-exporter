// src: scripts/__tests__/unit/normalize-chatlogs.cli-args.unit.spec.ts
// @(#): CLI引数・出力ディレクトリ解決のユニットテスト
//       対象: parseArgs, resolveOutputDir
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { parseArgs } from '../../normalize-chatlogs.ts';

type ParsedArgs = ReturnType<typeof parseArgs>;

describe('parseArgs', () => {
  // ─── T-08-01: デフォルト値 ────────────────────────────────────────────────────

  describe('Given: オプションなしの空配列', () => {
    describe('When: parseArgs([]) を呼び出す', () => {
      describe('Then: T-08-02 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof ParsedArgs; expected: unknown }[] = [
          { id: 'T-08-02-01', field: 'concurrency', expected: 4 },
          { id: 'T-08-02-02', field: 'dryRun', expected: false },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs([])[field], expected);
          });
        }
      });
    });
  });

  // ─── T-08-01: 単一・複数オプション ───────────────────────────────────────────

  describe('Given: 各種オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof ParsedArgs; expected: unknown }[] = [
          { id: 'T-08-01-01', args: ['--dir', '/some/path'], field: 'dir', expected: '/some/path' },
          { id: 'T-08-01-02a', args: ['--agent', 'claude'], field: 'agent', expected: 'claude' },
          { id: 'T-08-01-02b', args: ['--year-month', '2026-03'], field: 'yearMonth', expected: '2026-03' },
          { id: 'T-08-01-02c', args: ['--dry-run'], field: 'dryRun', expected: true },
          { id: 'T-08-01-02d', args: ['--concurrency', '8'], field: 'concurrency', expected: 8 },
          { id: 'T-08-01-02e', args: ['--output', './out'], field: 'output', expected: './out' },
        ];
        for (const { id, args, field, expected } of _cases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(args)[field], expected);
          });
        }
      });
    });
  });

  // ─── T-08-01: 複数オプション組み合わせ ───────────────────────────────────────

  describe('Given: 全オプションを組み合わせた引数', () => {
    it('T-08-01-02: 全フィールドが正しく解析される', () => {
      const result = parseArgs([
        '--agent',
        'claude',
        '--year-month',
        '2026-03',
        '--dry-run',
        '--concurrency',
        '8',
        '--output',
        './out',
      ]);
      assertEquals(result.agent, 'claude');
      assertEquals(result.yearMonth, '2026-03');
      assertEquals(result.dryRun, true);
      assertEquals(result.concurrency, 8);
      assertEquals(result.output, './out');
    });
  });

  // ─── T-08-04: パス正規化と自動 --dir 判定 ────────────────────────────────────

  describe('Given: パス引数', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: T-08-04 - dir フィールドにスラッシュ正規化されたパスが設定される', () => {
        const _pathCases: { id: string; args: string[]; expected: string }[] = [
          { id: 'T-08-04-01', args: ['--dir', 'chatlogs\\claude'], expected: 'chatlogs/claude' },
          {
            id: 'T-08-04-02',
            args: ['chatlogs/claude/2026/2026-03'],
            expected: 'chatlogs/claude/2026/2026-03',
          },
          {
            id: 'T-08-04-03',
            args: ['chatlogs\\claude\\2026\\2026-03'],
            expected: 'chatlogs/claude/2026/2026-03',
          },
        ];
        for (const { id, args, expected } of _pathCases) {
          it(`${id}: dir が "${expected}" になる`, () => {
            assertEquals(parseArgs(args).dir, expected);
          });
        }
      });
    });
  });

  // ─── 異常系: ChatlogError がスローされる ──────────────────────────────────────

  describe('Given: 未知のオプション', () => {
    it('T-08-03-01: ChatlogError(InvalidArgs) がスローされる', () => {
      assertThrows(
        () => parseArgs(['--unknown']),
        ChatlogError,
        'Invalid Args',
      );
    });
  });
});
