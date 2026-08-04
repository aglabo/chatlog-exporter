// src: scripts/__tests__/integration/filter/with-concurrency.integration.spec.ts
// @(#): withConcurrency の統合テスト
//       並列実行制限付きタスク実行の検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { withConcurrency } from '../../../../../_cle-libs/libs/parallel/concurrency.ts';

// ─── T-FL-WC-01: タスク数 < limit → 全タスク実行 ─────────────────────────────

describe('withConcurrency', () => {
  describe('Given: タスク数が limit より少ない場合', () => {
    describe('When: withConcurrency(tasks, limit) を呼び出す', () => {
      describe('Then: T-FL-WC-01 - 全タスクが実行される', () => {
        it('T-FL-WC-01-02: 結果の順序が保持される', async () => {
          const tasks = [
            () => Promise.resolve('a'),
            () => Promise.resolve('b'),
            () => Promise.resolve('c'),
          ];

          const results = await withConcurrency(tasks, 10);

          assertEquals(results[0], 'a');
          assertEquals(results[1], 'b');
          assertEquals(results[2], 'c');
        });
      });
    });
  });

  // ─── T-FL-WC-02: タスク数 > limit → 並列制限遵守 ───────────────────────────

  describe('Given: タスク数が limit より多い場合', () => {
    describe('When: withConcurrency(tasks, 2) を呼び出す', () => {
      describe('Then: T-FL-WC-02 - 全タスクが実行されて結果が返される', () => {
        it('T-FL-WC-02-01: 5 タスク / limit=2 → 5 件全て完了する', async () => {
          const executed: number[] = [];
          const tasks = [1, 2, 3, 4, 5].map((n) => () =>
            new Promise<number>((resolve) => {
              executed.push(n);
              resolve(n);
            })
          );

          const results = await withConcurrency(tasks, 2);

          assertEquals(results.length, 5);
          assertEquals(executed.length, 5);
        });

        it('T-FL-WC-02-02: 結果の順序がタスクの定義順と一致する', async () => {
          const tasks = [10, 20, 30].map((n) => () => Promise.resolve(n));

          const results = await withConcurrency(tasks, 2);

          assertEquals(results, [10, 20, 30]);
        });
      });
    });
  });

  // ─── T-FL-WC-03: タスクが reject → エラー伝播 ──────────────────────────────

  describe('Given: 一部のタスクが reject する場合', () => {
    describe('When: withConcurrency(tasks, limit) を呼び出す', () => {
      describe('Then: T-FL-WC-03 - エラーが伝播する', () => {
        it('T-FL-WC-03-01: reject するタスクがある → Promise が reject される', async () => {
          const tasks = [
            () => Promise.resolve(1),
            () => Promise.reject(new Error('タスク失敗')),
            () => Promise.resolve(3),
          ];

          await assertRejects(
            () => withConcurrency(tasks, 3),
            Error,
            'タスク失敗',
          );
        });
      });
    });
  });

  // ─── T-FL-WC-04: reject 返却前に実行中の他タスクの完了を待つ ───────────────

  describe('Given: 一部のタスクが reject し、他タスクがまだ実行中の場合', () => {
    describe('When: withConcurrency(tasks, limit) を呼び出す', () => {
      describe('Then: T-FL-WC-04 - reject 返却前に実行中タスクの完了を待つ', () => {
        it('T-FL-WC-04-01: reject が呼び出し元に返る時点で実行中タスクは完了している', async () => {
          let otherTaskDone = false;
          const tasks = [
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              throw new Error('タスク失敗');
            },
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 30));
              otherTaskDone = true;
              return 1;
            },
          ];

          await assertRejects(
            () => withConcurrency(tasks, 2),
            Error,
            'タスク失敗',
          );

          assertEquals(otherTaskDone, true);
        });
      });
    });
  });
});
