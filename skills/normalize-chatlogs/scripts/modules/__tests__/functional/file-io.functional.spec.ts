// src: skills/normalize-chatlogs/scripts/modules/__tests__/functional/file-io.functional.spec.ts
// @(#): file-io モジュールの機能テスト
//       対象: writeOutput (Deno.stat/rename/writeTextFile モック経由)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// ─── Test target
import { writeOutput } from '../../file-io.ts';

// ─── Helpers
// types
import type { Stats } from '../../../types/normalize.types.ts';

// ─── Tests

/**
 * `writeOutput` の機能テストスイート。
 *
 * Deno.stat / Deno.rename / Deno.writeTextFile をモック化し、
 * ファイル書き込み、既存ファイルのリネーム、ドライランモード、バックアップ上限超過を検証する。
 *
 * テスト ID 範囲: T-13-01 〜 T-13-05
 *
 * @see writeOutput
 */
describe('writeOutput', () => {
  let renameStub: Stub | null = null;
  let writeTextFileStub: Stub | null = null;

  afterEach(() => {
    renameStub?.restore();
    renameStub = null;
    writeTextFileStub?.restore();
    writeTextFileStub = null;
  });

  /** 正常系: 存在しない出力パスにアトミックにファイルを書き込む */
  describe('Given: 存在しない出力パスと dryRun=false', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-01 - アトミックなファイル書き込み', () => {
        it('T-13-01-01: stats.success がインクリメントされる', async () => {
          const writtenPaths: string[] = [];
          writeTextFileStub = stub(Deno, 'writeTextFile', (path: string | URL) => {
            writtenPaths.push(String(path));
            return Promise.resolve();
          });
          renameStub = stub(Deno, 'rename', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/entry.md', 'content', false, stats);

          assertEquals(stats.success, 1);
          // .tmp ファイルに書いて rename するアトミック書き込みを確認
          assertEquals(writtenPaths.includes('output/entry.md.tmp'), true);
        });

        it('T-13-01-02: .tmp パスに書き込んでから outputPath にリネームする', async () => {
          const writtenPaths: string[] = [];
          writeTextFileStub = stub(Deno, 'writeTextFile', (path: string | URL) => {
            writtenPaths.push(String(path));
            return Promise.resolve();
          });
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/entry.md', 'content', false, stats);

          assertEquals(writtenPaths[0], 'output/entry.md.tmp');
          assertEquals(renamedArgs[renamedArgs.length - 1], ['output/entry.md.tmp', 'output/entry.md']);
        });
      });
    });
  });

  /** 正常系: すでに存在するファイルを .old-01.md にリネームしてから新規書き込みする */
  describe('Given: すでに存在する出力パス', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-02 - 既存ファイルのリネームと新規書き込み', () => {
        it('T-13-02-01: 既存ファイルを .old-01.md にリネームしてから書き込む', async () => {
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          // バックアップファイルなし → old-01.md に
          await writeOutput('output/existing.md', 'new content', false, stats, () => Promise.resolve(['existing.md']));

          // 1回目のリネームが既存ファイル → old-01.md であること
          assertEquals(renamedArgs[0], ['output/existing.md', 'output/existing.old-01.md']);
          assertEquals(stats.success, 1);
          assertEquals(stats.skip, 0);
        });

        it('T-13-02-02: .old-01.md が既にある場合は .old-02.md にリネームする', async () => {
          const renamedArgs: Array<[string, string]> = [];
          renameStub = stub(Deno, 'rename', (from: string | URL, to: string | URL) => {
            renamedArgs.push([String(from), String(to)]);
            return Promise.resolve();
          });
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          // old-01.md が既存 → old-02.md に
          await writeOutput(
            'output/existing.md',
            'new content',
            false,
            stats,
            () => Promise.resolve(['existing.md', 'existing.old-01.md']),
          );

          assertEquals(renamedArgs[0], ['output/existing.md', 'output/existing.old-02.md']);
          assertEquals(stats.success, 1);
        });
      });
    });
  });

  /** 正常系: dryRun=true のときファイル操作を行わない */
  describe('Given: dryRun=true', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-03 - ドライランモード', () => {
        it('T-13-03-01: Deno.writeTextFile が呼ばれず stats.success が 0 のまま', async () => {
          writeTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());
          const stats: Stats = { success: 0, skip: 0, fail: 0 };

          await writeOutput('output/dry.md', '## Summary\nbody', true, stats);

          assertEquals((writeTextFileStub as unknown as { calls: unknown[] }).calls.length, 0);
          assertEquals(stats.success, 0);
        });
      });
    });
  });

  describe('[異常] Error Cases', () => {
    /** 異常系: バックアップスロット 01〜99 がすべて埋まっている場合は Error をスローする */
    describe('Given: outputPath と old-01〜old-99 が全て存在する', () => {
      describe('When: writeOutput を呼び出す', () => {
        describe('Then: Task T-13-05 - バックアップスロット上限超過で Error をスローする', () => {
          it('T-13-05-01: "too many backups" エラーをスローする', async () => {
            renameStub = stub(Deno, 'rename', () => Promise.resolve());
            const allSlots = [
              'entry.md',
              ...Array.from({ length: 99 }, (_, i) => `entry.old-${String(i + 1).padStart(2, '0')}.md`),
            ];
            const stats: Stats = { success: 0, skip: 0, fail: 0 };

            await assertRejects(
              () => writeOutput('output/entry.md', 'content', false, stats, () => Promise.resolve(allSlots)),
              Error,
              'too many backups',
            );
          });
        });
      });
    });
  });
});
