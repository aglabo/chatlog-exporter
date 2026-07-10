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

// ─── Tests

/**
 * `writeOutput` の機能テストスイート。
 *
 * Deno.stat / Deno.rename / Deno.writeTextFile をモック化し、
 * ドライランモード、バックアップ上限超過を検証する。
 *
 * テスト ID 範囲: T-13-03 〜 T-13-05
 *
 * @see writeOutput
 */
describe('writeOutput', () => {
  let denoRenameStub: Stub | null = null;
  let denoWriteTextFileStub: Stub | null = null;

  afterEach(() => {
    denoRenameStub?.restore();
    denoRenameStub = null;
    denoWriteTextFileStub?.restore();
    denoWriteTextFileStub = null;
  });

  /** 正常系: dryRun=true のときファイル操作を行わない */
  describe('Given: dryRun=true', () => {
    describe('When: writeOutput を呼び出す', () => {
      describe('Then: Task T-13-03 - ドライランモード', () => {
        it('T-13-03-01: Deno.writeTextFile が呼ばれず false が返る', async () => {
          denoWriteTextFileStub = stub(Deno, 'writeTextFile', () => Promise.resolve());

          const result = await writeOutput('output/dry.md', '## Summary\nbody', true);

          assertEquals((denoWriteTextFileStub as unknown as { calls: unknown[] }).calls.length, 0);
          assertEquals(result, false);
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
            denoRenameStub = stub(Deno, 'rename', () => Promise.resolve());
            const allSlots = [
              'entry.md',
              ...Array.from({ length: 99 }, (_, i) => `entry.old-${String(i + 1).padStart(2, '0')}.md`),
            ];

            await assertRejects(
              () => writeOutput('output/entry.md', 'content', false, () => Promise.resolve(allSlots)),
              Error,
              'too many backups',
            );
          });
        });
      });
    });
  });
});
