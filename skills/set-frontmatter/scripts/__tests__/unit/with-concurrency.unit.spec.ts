// src: scripts/__tests__/unit/set-frontmatter.with-concurrency.unit.spec.ts
// @(#): withConcurrency のユニットテスト
//       並列実行ヘルパーの動作検証
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// test target
import { withConcurrency } from '../../../../_scripts/libs/parallel/concurrency.ts';

// ─── 基本的な並列実行 ─────────────────────────────────────────────────────────

describe('withConcurrency', () => {
  describe('Given: 3タスクと limit=2', () => {
    describe('When: withConcurrency(tasks, 2) を呼び出す', () => {
      describe('Then: T-SF-WC-01 - 結果3件、順序保持', () => {
        const tasks = [
          () => Promise.resolve(1),
          () => Promise.resolve(2),
          () => Promise.resolve(3),
        ];

        it('T-SF-WC-01-01: 結果が3件返る', async () => {
          const results = await withConcurrency(tasks, 2);

          assertEquals(results.length, 3);
        });

        it('T-SF-WC-01-02: 結果が入力順と一致する', async () => {
          const results = await withConcurrency(tasks, 2);

          assertEquals(results, [1, 2, 3]);
        });
      });
    });
  });

  // ─── タスク数 < limit の場合 ─────────────────────────────────────────────

  describe('Given: 5タスクと limit=10（タスク数 < limit）', () => {
    describe('When: withConcurrency(tasks, 10) を呼び出す', () => {
      describe('Then: T-SF-WC-02 - 全タスク完了', () => {
        const tasks = [0, 1, 2, 3, 4].map((n) => () => Promise.resolve(n));

        it('T-SF-WC-02-01: 結果が5件返る', async () => {
          const results = await withConcurrency(tasks, 10);

          assertEquals(results.length, 5);
        });

        it('T-SF-WC-02-02: 結果が [0, 1, 2, 3, 4] になる', async () => {
          const results = await withConcurrency(tasks, 10);

          assertEquals(results, [0, 1, 2, 3, 4]);
        });
      });
    });
  });

  // ─── limit=1（逐次処理） ──────────────────────────────────────────────────

  describe('Given: 4タスクと limit=1', () => {
    describe('When: withConcurrency(tasks, 1) を呼び出す', () => {
      describe('Then: T-SF-WC-03 - 逐次実行、入力順と同じ結果順', () => {
        const order: number[] = [];
        const tasks = [10, 20, 30, 40].map((n) => () => {
          order.push(n);
          return Promise.resolve(n);
        });

        it('T-SF-WC-03-01: 結果の順序が入力順と一致する', async () => {
          const results = await withConcurrency(tasks, 1);

          assertEquals(results, [10, 20, 30, 40]);
        });

        it('T-SF-WC-03-02: タスク実行順が入力順と一致する', async () => {
          order.length = 0;
          await withConcurrency(tasks, 1);

          assertEquals(order, [10, 20, 30, 40]);
        });
      });
    });
  });

  // ─── 0件タスク ────────────────────────────────────────────────────────────

  describe('Given: 0件タスクと limit=4', () => {
    describe('When: withConcurrency([], 4) を呼び出す', () => {
      describe('Then: T-SF-WC-04 - 空配列が返る', () => {
        it('T-SF-WC-04-01: 空配列が返る', async () => {
          const results = await withConcurrency([], 4);

          assertEquals(results, []);
        });
      });
    });
  });

  // ─── 文字列を返すタスク ───────────────────────────────────────────────────

  describe('Given: 文字列を返す3タスクと limit=2', () => {
    describe('When: withConcurrency(tasks, 2) を呼び出す', () => {
      describe('Then: T-SF-WC-05 - 文字列の結果が正しく返る', () => {
        const tasks = [
          () => Promise.resolve('a'),
          () => Promise.resolve('b'),
          () => Promise.resolve('c'),
        ];

        it('T-SF-WC-05-01: 結果が ["a", "b", "c"] になる', async () => {
          const results = await withConcurrency(tasks, 2);

          assertEquals(results, ['a', 'b', 'c']);
        });
      });
    });
  });
});
