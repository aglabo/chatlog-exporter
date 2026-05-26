// src: scripts/modules/__tests__/unit/classify-file.unit.spec.ts
// @(#): classifyFile の単体テスト（dryRun=true 分岐）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyFile } from '../../file-ops.ts';

// ─── Helpers
// stub
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Internal Helpers
import { _makeClassifyChatlogEntry, _makeStats } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

describe('classifyFile', () => {
  describe('Given: dryRun=true の呼び出し', () => {
    describe('When: classifyFile(fileMeta, "app1", "/tmp/output", true, stats) を呼び出す', () => {
      describe('Then: T-CL-CF-01 - ファイルシステム不使用・stats.moved+1', () => {
        let loggerStub: LoggerStub;

        beforeEach(() => {
          loggerStub = makeLoggerStub();
        });

        afterEach(() => {
          loggerStub.restore();
        });

        it('T-CL-CF-01-01: stats.moved が 1 になる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-CF-01-02: stats.error が 0 のまま', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats);

          assertEquals(stats.error, 0);
        });

        it('T-CL-CF-01-03: infoLogs に "[dry-run]" が含まれる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats);

          assert(loggerStub.infoLogs.some((msg) => msg.includes('[dry-run]')));
        });

        it('T-CL-CF-01-04: infoLogs に "→ app1/" が含まれる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats);

          const _allInfo = loggerStub.infoLogs.join('\n');
          assertStringIncludes(_allInfo, '→ app1/');
        });
      });
    });
  });

  describe('Given: project=undefined の呼び出し', () => {
    describe('When: classifyFile(fileMeta, undefined, "/tmp/output", false, stats) を呼び出す', () => {
      describe('Then: T-CL-CF-03 - stats.skipped+1・ファイルシステム不使用', () => {
        let loggerStub: LoggerStub;

        beforeEach(() => {
          loggerStub = makeLoggerStub();
        });

        afterEach(() => {
          loggerStub.restore();
        });

        it('T-CL-CF-03-01: stats.skipped が 1 になる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, undefined, '/tmp/output', false, stats);

          assertEquals(stats.skipped, 1);
        });

        it('T-CL-CF-03-02: stats.moved / movedByAI / error が 0 のまま', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, undefined, '/tmp/output', false, stats);

          assertEquals(stats.moved, 0);
          assertEquals(stats.movedByAI, 0);
          assertEquals(stats.error, 0);
        });

        it('T-CL-CF-03-03: warnLogs に "[skip: no-project]" が含まれる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, undefined, '/tmp/output', false, stats);

          assert(loggerStub.warnLogs.some((msg) => msg.includes('[skip: no-project]')));
        });
      });
    });
  });

  describe('Given: byAI=true の呼び出し', () => {
    describe('When: classifyFile(fileMeta, "app1", "/tmp/output", true, stats, true) を呼び出す (dryRun=true)', () => {
      describe('Then: T-CL-CF-02 - stats.movedByAI がインクリメントされ stats.moved は変化しない', () => {
        let loggerStub: LoggerStub;

        beforeEach(() => {
          loggerStub = makeLoggerStub();
        });

        afterEach(() => {
          loggerStub.restore();
        });

        it('T-CL-CF-02-01: byAI=true + dryRun=true → stats.movedByAI === 1', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats, true);

          assertEquals(stats.movedByAI, 1);
        });

        it('T-CL-CF-02-02: byAI=true + dryRun=true → stats.moved === 0', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', '/tmp/output', true, stats, true);

          assertEquals(stats.moved, 0);
        });
      });
    });
  });

  describe('Given: destDir に Windows バックスラッシュパスを渡す呼び出し', () => {
    describe('When: classifyFile(fileMeta, "app1", "C:\\\\output", true, stats) を呼び出す (dryRun=true)', () => {
      describe('Then: T-CL-CF-04 - normalizePath によりパスが正規化されて処理が壊れない', () => {
        let loggerStub: LoggerStub;

        beforeEach(() => {
          loggerStub = makeLoggerStub();
        });

        afterEach(() => {
          loggerStub.restore();
        });

        it('T-CL-CF-04-01: destDir="C:\\\\output" + dryRun=true → stats.moved === 1', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', 'C:\\output', true, stats);

          assertEquals(stats.moved, 1);
        });
      });
    });
  });
});
