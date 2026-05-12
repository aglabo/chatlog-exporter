// src: scripts/__tests__/unit/set-frontmatter.parse-args.unit.spec.ts
// @(#): parseArgs のユニットテスト
//       CLI 引数解析: デフォルト値・各オプション・エラー終了
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { ChatlogError } from '../../../../_scripts/classes/ChatlogError.class.ts';
import { DEFAULT_CONCURRENCY, parseArgs } from '../../set-frontmatter.ts';

type Args = ReturnType<typeof parseArgs>;

describe('parseArgs', () => {
  // ─── T-SF-PA-01: デフォルト値 ────────────────────────────────────────────────

  describe('Given: 最小引数 ["/path/to/dir"]', () => {
    describe('When: parseArgs(["/path/to/dir"]) を呼び出す', () => {
      describe('Then: T-SF-PA-01 - デフォルト値が適用される', () => {
        const _defaultCases: { id: string; field: keyof Args; expected: unknown }[] = [
          { id: 'T-SF-PA-01-01', field: 'targetDir', expected: '/path/to/dir' },
          { id: 'T-SF-PA-01-02', field: 'dicsDir', expected: './assets/dics' },
          { id: 'T-SF-PA-01-03', field: 'dryRun', expected: false },
          { id: 'T-SF-PA-01-04', field: 'review', expected: true },
          { id: 'T-SF-PA-01-05', field: 'concurrency', expected: DEFAULT_CONCURRENCY },
        ];
        for (const { id, field, expected } of _defaultCases) {
          it(`${id}: ${field} が ${JSON.stringify(expected)} になる`, () => {
            assertEquals(parseArgs(['/path/to/dir'])[field], expected);
          });
        }
      });
    });
  });

  // ─── T-SF-PA-02〜08: 単一オプション ──────────────────────────────────────────

  describe('Given: 単一オプション', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: 対応フィールドに値が設定される', () => {
        const _cases: { id: string; args: string[]; field: keyof Args; expected: unknown }[] = [
          { id: 'T-SF-PA-02-01', args: ['/path', '--dry-run'], field: 'dryRun', expected: true },
          { id: 'T-SF-PA-03-01', args: ['/path', '--no-review'], field: 'review', expected: false },
          { id: 'T-SF-PA-04-01', args: ['/path', '--dics', '/dics'], field: 'dicsDir', expected: '/dics' },
          { id: 'T-SF-PA-05-01', args: ['/path', '--dics=/dics'], field: 'dicsDir', expected: '/dics' },
          { id: 'T-SF-PA-06-01', args: ['/path', '--concurrency', '8'], field: 'concurrency', expected: 8 },
          { id: 'T-SF-PA-07-01', args: ['/path', '--concurrency=8'], field: 'concurrency', expected: 8 },
          {
            id: 'T-SF-PA-08-01',
            args: ['/path', '--concurrency=invalid'],
            field: 'concurrency',
            expected: DEFAULT_CONCURRENCY,
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

  // ─── T-SF-PA-09: 複数オプション組み合わせ ────────────────────────────────────

  describe('Given: 全オプションを組み合わせた引数', () => {
    it('T-SF-PA-09-01: 全フィールドが正しく解析される', () => {
      const result = parseArgs(['/path/to/dir', '--dry-run', '--no-review', '--dics', '/dics', '--concurrency', '2']);
      assertEquals(result.targetDir, '/path/to/dir');
      assertEquals(result.dryRun, true);
      assertEquals(result.review, false);
      assertEquals(result.dicsDir, '/dics');
      assertEquals(result.concurrency, 2);
    });
  });

  // ─── 異常系: ChatlogError がスローされる ──────────────────────────────────────

  describe('Given: 不正な引数', () => {
    describe('When: parseArgs(args) を呼び出す', () => {
      describe('Then: ChatlogError(InvalidArgs) がスローされる', () => {
        const _errorCases: { id: string; args: string[]; label: string }[] = [
          { id: 'T-SF-PA-10-01', args: [], label: 'targetDir なし（空配列）' },
          { id: 'T-SF-PA-11-01', args: ['/path', '--unknown'], label: '未知オプション' },
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
