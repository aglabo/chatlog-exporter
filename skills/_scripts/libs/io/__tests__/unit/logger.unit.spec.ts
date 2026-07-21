// src: skills/_scripts/libs/__tests__/unit/logger.unit.spec.ts
// @(#): logger のユニットテスト
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, stub } from '@std/testing/mock';
// types
import type { Stub } from '@std/testing/mock';

// -- test target --
import { logger } from '../../logger.ts';

// ─────────────────────────────────────────────
// logger
// ─────────────────────────────────────────────

/**
 * `logger` のユニットテストスイート。
 *
 * 各メソッドの出力先（stdout / stderr）と prefix の有無をカバーする。
 */
describe('logger', () => {
  let logSpy: Stub;
  let errorSpy: Stub;

  beforeEach(() => {
    logSpy = stub(console, 'log', () => {});
    errorSpy = stub(console, 'error', () => {});
  });

  afterEach(() => {
    logSpy.restore();
    errorSpy.restore();
  });

  // ─── グループ01: logger.log ──────────────────────────────────────────────────

  describe('Given: msg="hello"', () => {
    describe('When: logger.log("hello") を呼び出す', () => {
      describe('Then: T-LIB-LOG-01 - prefix なしで stdout へ出力する', () => {
        it('T-LIB-LOG-01-01: console.log が 1 回呼ばれる', () => {
          logger.log('hello');
          assertSpyCalls(logSpy, 1);
        });

        it('T-LIB-LOG-01-02: console.log の引数が "hello" である（prefix なし）', () => {
          logger.log('hello');
          assertSpyCalls(logSpy, 1);
          const [arg] = logSpy.calls[0].args as [string];
          if (arg !== 'hello') {
            throw new Error(`Expected "hello", got "${arg}"`);
          }
        });

        it('T-LIB-LOG-01-03: console.error は呼ばれない', () => {
          logger.log('hello');
          assertSpyCalls(errorSpy, 0);
        });
      });
    });
  });

  // ─── グループ02: logger.info ─────────────────────────────────────────────────

  describe('Given: msg="info message"', () => {
    describe('When: logger.info("info message") を呼び出す', () => {
      describe('Then: T-LIB-LOG-02 - "::info::" prefix を付けて stderr へ出力する', () => {
        it('T-LIB-LOG-02-01: console.error が 1 回呼ばれる', () => {
          logger.info('info message');
          assertSpyCalls(errorSpy, 1);
        });

        it('T-LIB-LOG-02-02: console.error の引数が "::info:: info message" である', () => {
          logger.info('info message');
          const [arg] = errorSpy.calls[0].args as [string];
          if (arg !== '::info:: info message') {
            throw new Error(`Expected "::info:: info message", got "${arg}"`);
          }
        });

        it('T-LIB-LOG-02-03: console.log は呼ばれない', () => {
          logger.info('info message');
          assertSpyCalls(logSpy, 0);
        });
      });
    });
  });

  // ─── グループ03: logger.warn ─────────────────────────────────────────────────

  describe('Given: msg="warn message"', () => {
    describe('When: logger.warn("warn message") を呼び出す', () => {
      describe('Then: T-LIB-LOG-03 - "::warn::" prefix を付けて stderr へ出力する', () => {
        it('T-LIB-LOG-03-01: console.error が 1 回呼ばれる', () => {
          logger.warn('warn message');
          assertSpyCalls(errorSpy, 1);
        });

        it('T-LIB-LOG-03-02: console.error の引数が "::warn:: warn message" である', () => {
          logger.warn('warn message');
          const [arg] = errorSpy.calls[0].args as [string];
          if (arg !== '::warn:: warn message') {
            throw new Error(`Expected "::warn:: warn message", got "${arg}"`);
          }
        });

        it('T-LIB-LOG-03-03: console.log は呼ばれない', () => {
          logger.warn('warn message');
          assertSpyCalls(logSpy, 0);
        });
      });
    });
  });

  // ─── グループ04: logger.error ────────────────────────────────────────────────

  describe('Given: msg="error message"', () => {
    describe('When: logger.error("error message") を呼び出す', () => {
      describe('Then: T-LIB-LOG-04 - "::error::" prefix を付けて stderr へ出力する', () => {
        it('T-LIB-LOG-04-01: console.error が 1 回呼ばれる', () => {
          logger.error('error message');
          assertSpyCalls(errorSpy, 1);
        });

        it('T-LIB-LOG-04-02: console.error の引数が "::error:: error message" である', () => {
          logger.error('error message');
          const [arg] = errorSpy.calls[0].args as [string];
          if (arg !== '::error:: error message') {
            throw new Error(`Expected "::error:: error message", got "${arg}"`);
          }
        });

        it('T-LIB-LOG-04-03: console.log は呼ばれない', () => {
          logger.error('error message');
          assertSpyCalls(logSpy, 0);
        });
      });
    });
  });

  // ─── グループ05: logger.dryrun ───────────────────────────────────────────────

  describe('Given: msg="dry message"', () => {
    describe('When: logger.dryrun("dry message") を呼び出す', () => {
      describe('Then: T-LIB-LOG-05 - "::info:: <<dry-run>>" prefix を付けて stderr へ出力する', () => {
        it('T-LIB-LOG-05-01: console.error が 1 回呼ばれる', () => {
          logger.dryrun('dry message');
          assertSpyCalls(errorSpy, 1);
        });

        it('T-LIB-LOG-05-02: console.error の引数が "::info:: <<dry-run>> dry message" である', () => {
          logger.dryrun('dry message');
          const [arg] = errorSpy.calls[0].args as [string];
          if (arg !== '::info:: <<dry-run>> dry message') {
            throw new Error(`Expected "::info:: <<dry-run>> dry message", got "${arg}"`);
          }
        });

        it('T-LIB-LOG-05-03: console.log は呼ばれない', () => {
          logger.dryrun('dry message');
          assertSpyCalls(logSpy, 0);
        });
      });
    });
  });
});
