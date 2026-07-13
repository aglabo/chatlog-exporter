// src: skills/_scripts/libs/__tests__/unit/concurrency.unit.spec.ts
// @(#): withConcurrency / createTasks / runConcurrent / runChunked のユニットテスト（T-LIB-C-* / T-SF-WC-*）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// -- test target --
import { createTasks, runChunked, runConcurrent, withConcurrency } from '../../concurrency.ts';

// ─────────────────────────────────────────────
// withConcurrency
// ─────────────────────────────────────────────

describe('withConcurrency', () => {
  describe('Given: tasks 3個, limit 2', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-01 - 結果が入力順で返る', () => {
        it('T-LIB-C-01-01: 結果配列が入力順序と一致する', async () => {
          const _tasks = [1, 2, 3].map((n) => () => Promise.resolve(n * 10));
          const _results = await withConcurrency(_tasks, 2);
          assertEquals(_results, [10, 20, 30]);
        });
      });
    });
  });

  describe('Given: tasks 2個, limit 5 (limit > tasks.length)', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-02 - 正常に結果を返す', () => {
        it('T-LIB-C-02-01: worker 数が tasks.length を超えても正常に返る', async () => {
          const _tasks = [1, 2].map((n) => () => Promise.resolve(n));
          const _results = await withConcurrency(_tasks, 5);
          assertEquals(_results, [1, 2]);
        });
      });
    });
  });

  describe('Given: tasks が空配列', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-03 - 空配列を返す', () => {
        it('T-LIB-C-03-01: 空の結果配列が返る', async () => {
          const _results = await withConcurrency([], 4);
          assertEquals(_results, []);
        });
      });
    });
  });

  describe('Given: tasks のうち1個が reject する', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-04 - reject が伝播する', () => {
        it('T-LIB-C-04-01: reject した Error が伝播する', async () => {
          const _tasks = [
            () => Promise.resolve(1),
            () => Promise.reject(new Error('task failed')),
            () => Promise.resolve(3),
          ];
          await assertRejects(
            () => withConcurrency(_tasks, 2),
            Error,
            'task failed',
          );
        });
      });
    });
  });

  describe('Given: 遅いタスクと速いタスクが混在する', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-14 - 完了順に関わらず入力順で結果が返る', () => {
        it('T-LIB-C-14-01: 遅いタスク(index=0)が先頭にあっても結果配列は入力順', async () => {
          const _order: number[] = [];
          const _tasks = [
            async () => {
              await new Promise((r) => setTimeout(r, 20));
              _order.push(0);
              return 'slow';
            },
            () => {
              _order.push(1);
              return Promise.resolve('fast1');
            },
            () => {
              _order.push(2);
              return Promise.resolve('fast2');
            },
          ];
          const _results = await withConcurrency(_tasks, 3);
          assertEquals(_results, ['slow', 'fast1', 'fast2']);
        });
      });
    });
  });

  describe('Given: 複数のタスクが reject する', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-15 - いずれかの reject が伝播する', () => {
        it('T-LIB-C-15-01: 複数タスクが reject するとき Promise が reject される', async () => {
          const _tasks = [
            () => Promise.reject(new Error('fail-1')),
            () => Promise.reject(new Error('fail-2')),
            () => Promise.resolve('ok'),
          ];
          await assertRejects(
            () => withConcurrency(_tasks, 2),
            Error,
          );
        });
      });
    });
  });

  describe('Given: 先頭タスクが ctl.abort() を呼び、後続タスクは呼び出し有無を記録する', () => {
    describe('When: withConcurrency(tasks, 1) を実行する（limit=1 で決定的な実行順にする）', () => {
      describe('Then: T-LIB-C-18 - abort 後も未着手タスクが呼ばれ続け結果配列に穴が空かない', () => {
        it('T-LIB-C-18-01: 全タスクが呼ばれ calls が [0, 1, 2] になる', async () => {
          const _calls: number[] = [];
          const _tasks = [0, 1, 2].map((n) => (ctl: AbortController) => {
            _calls.push(n);
            if (n === 0) { ctl.abort(); }
            return Promise.resolve(n * 10);
          });
          await withConcurrency(_tasks, 1);
          assertEquals(_calls, [0, 1, 2]);
        });

        it('T-LIB-C-18-02: 結果配列に穴が空かず [0, 10, 20] になる', async () => {
          const _tasks = [0, 1, 2].map((n) => (ctl: AbortController) => {
            if (n === 0) { ctl.abort(); }
            return Promise.resolve(n * 10);
          });
          const _results = await withConcurrency(_tasks, 1);
          assertEquals(_results, [0, 10, 20]);
        });
      });
    });
  });

  describe('Given: limit=1（順序実行）', () => {
    describe('When: withConcurrency を実行する', () => {
      describe('Then: T-LIB-C-16 - タスクが順序通りに実行され結果が入力順で返る', () => {
        it('T-LIB-C-16-01: limit=1 でも結果配列が入力順序と一致する', async () => {
          const _executed: number[] = [];
          const _tasks = [1, 2, 3].map((n) => () => {
            _executed.push(n);
            return Promise.resolve(n * 10);
          });
          const _results = await withConcurrency(_tasks, 1);
          assertEquals(_results, [10, 20, 30]);
          assertEquals(_executed, [1, 2, 3]);
        });
      });
    });
  });

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

// ─────────────────────────────────────────────
// createTasks
// ─────────────────────────────────────────────

describe('createTasks', () => {
  describe('Given: items 3個, fn 定義済み', () => {
    describe('When: createTasks を実行する', () => {
      describe('Then: T-LIB-C-05 - Task[] が返る', () => {
        it('T-LIB-C-05-01: 返値の長さが items.length と一致する', () => {
          const _tasks = createTasks([1, 2, 3], (n) => Promise.resolve(n));
          assertEquals(_tasks.length, 3);
        });

        it('T-LIB-C-05-02: 各要素が関数である', () => {
          const _tasks = createTasks([1, 2, 3], (n) => Promise.resolve(n));
          for (const task of _tasks) {
            assertEquals(typeof task, 'function');
          }
        });
      });
    });
  });

  describe('Given: createTasks の Task[] を withConcurrency で実行', () => {
    describe('When: withConcurrency に渡す', () => {
      describe('Then: T-LIB-C-06 - 全 item に fn 適用した結果が返る', () => {
        it('T-LIB-C-06-01: 各 item に fn を適用した結果配列が返る', async () => {
          const _tasks = createTasks(['a', 'b', 'c'], (s) => Promise.resolve(s.toUpperCase()));
          const _results = await withConcurrency(_tasks, 2);
          assertEquals(_results, ['A', 'B', 'C']);
        });
      });
    });
  });

  describe('Given: items が空配列', () => {
    describe('When: createTasks を実行する', () => {
      describe('Then: T-LIB-C-07 - 空の Task[] を返す', () => {
        it('T-LIB-C-07-01: 空の配列が返る', () => {
          const _tasks = createTasks([], (n: number) => Promise.resolve(n));
          assertEquals(_tasks, []);
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// runConcurrent
// ─────────────────────────────────────────────

describe('runConcurrent', () => {
  describe('Given: items 3個, fn 定義済み, limit=2', () => {
    describe('When: runConcurrent を実行する', () => {
      describe('Then: T-LIB-C-08 - 入力順の結果配列が返る', () => {
        it('T-LIB-C-08-01: 結果配列が入力順序と一致する', async () => {
          const _results = await runConcurrent([1, 2, 3], (n) => Promise.resolve(n * 10), 2);
          assertEquals(_results, [10, 20, 30]);
        });
      });
    });
  });

  describe('Given: items が空配列', () => {
    describe('When: runConcurrent を実行する', () => {
      describe('Then: T-LIB-C-09 - 空配列を返す', () => {
        it('T-LIB-C-09-01: 空の結果配列が返る', async () => {
          const _results = await runConcurrent([], (n: number) => Promise.resolve(n), 2);
          assertEquals(_results, []);
        });
      });
    });
  });

  describe('Given: fn が reject する', () => {
    describe('When: runConcurrent を実行する', () => {
      describe('Then: T-LIB-C-10 - reject が伝播する', () => {
        it('T-LIB-C-10-01: reject した Error が伝播する', async () => {
          await assertRejects(
            () =>
              runConcurrent(
                [1, 2, 3],
                (n) => n === 2 ? Promise.reject(new Error('item failed')) : Promise.resolve(n),
                2,
              ),
            Error,
            'item failed',
          );
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// runChunked
// ─────────────────────────────────────────────

describe('runChunked', () => {
  describe('Given: items 5個, chunkSize=2, limit=2', () => {
    describe('When: runChunked を実行する', () => {
      describe('Then: T-LIB-C-11 - chunk 単位で fn が呼ばれ結果が返る', () => {
        it('T-LIB-C-11-01: fn が chunk 配列を受け取り、結果配列が返る', async () => {
          const _received: number[][] = [];
          const _fn = (chunk: number[]): Promise<number> => {
            _received.push(chunk);
            return Promise.resolve(chunk.reduce((a, b) => a + b, 0));
          };
          const _results = await runChunked([1, 2, 3, 4, 5], 2, _fn, 2);
          assertEquals(_received, [[1, 2], [3, 4], [5]]);
          assertEquals(_results, [3, 7, 5]);
        });
      });
    });
  });

  describe('Given: items が空配列', () => {
    describe('When: runChunked を実行する', () => {
      describe('Then: T-LIB-C-12 - 空配列を返す', () => {
        it('T-LIB-C-12-01: 空の結果配列が返る', async () => {
          const _results = await runChunked([], 2, (chunk: number[]) => Promise.resolve(chunk.length), 2);
          assertEquals(_results, []);
        });
      });
    });
  });

  describe('Given: chunkSize が items.length より大きい', () => {
    describe('When: runChunked を実行する', () => {
      describe('Then: T-LIB-C-13 - 1 chunk で fn が呼ばれる', () => {
        it('T-LIB-C-13-01: fn が全 items を含む 1 chunk を受け取る', async () => {
          const _received: number[][] = [];
          const _fn = (chunk: number[]): Promise<number> => {
            _received.push(chunk);
            return Promise.resolve(chunk.length);
          };
          const _results = await runChunked([1, 2, 3], 10, _fn, 2);
          assertEquals(_received.length, 1);
          assertEquals(_received[0], [1, 2, 3]);
          assertEquals(_results, [3]);
        });
      });
    });
  });

  describe('Given: chunkSize=1（1要素/chunk）', () => {
    describe('When: runChunked を実行する', () => {
      describe('Then: T-LIB-C-17 - items.length 個のチャンクが生成される', () => {
        it('T-LIB-C-17-01: items 3個 chunkSize=1 → fn が3回呼ばれ各チャンクは1要素', async () => {
          const _received: number[][] = [];
          const _fn = (chunk: number[]): Promise<number> => {
            _received.push([...chunk]);
            return Promise.resolve(chunk[0]);
          };
          const _results = await runChunked([10, 20, 30], 1, _fn, 2);
          assertEquals(_received, [[10], [20], [30]]);
          assertEquals(_results, [10, 20, 30]);
        });
      });
    });
  });
});
