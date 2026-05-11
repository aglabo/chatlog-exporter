// src: scripts/__tests__/unit/classify-chatlogs.classify-file.unit.spec.ts
// @(#): classifyFile の単体テスト（dryRun=true 分岐）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// -- BDD modules --
import { assertEquals, assertStringIncludes } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// -- Test target --
import { classifyFile } from '../../classify-chatlogs.ts';
// stub
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
// classes
import { ClassifyChatlogEntry } from '../../classes/ClassifyChatlogEntry.class.ts';
// types
import type { ClassifyStats } from '../../types/classify.types.ts';

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function _makeClassifyChatlogEntry(filename: string): ClassifyChatlogEntry {
  const text = `---\ntitle: Test Title\ncategory: development\ntopics:\n  - API\ntags:\n  - typescript\n---\n本文`;
  return new ClassifyChatlogEntry(text, `/tmp/input/${filename}`);
}

function _makeStats(): ClassifyStats {
  return { moved: 0, skipped: 0, error: 0 };
}

// ─── classifyFile ─────────────────────────────────────────────────────────────

describe('classifyFile', () => {
  describe('Given: dryRun=true の呼び出し', () => {
    describe('When: classifyFile(fileMeta, "app1", true, stats) を呼び出す', () => {
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

          await classifyFile(fileMeta, 'app1', true, stats);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-CF-01-02: stats.error が 0 のまま', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', true, stats);

          assertEquals(stats.error, 0);
        });

        it('T-CL-CF-01-03: infoLogs に "[dry-run]" が含まれる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', true, stats);

          assertEquals(loggerStub.infoLogs.some((msg) => msg.includes('[dry-run]')), true);
        });

        it('T-CL-CF-01-04: infoLogs に "→ app1/" が含まれる', async () => {
          const fileMeta = _makeClassifyChatlogEntry('test.md');
          const stats = _makeStats();

          await classifyFile(fileMeta, 'app1', true, stats);

          const _allInfo = loggerStub.infoLogs.join('\n');
          assertStringIncludes(_allInfo, '→ app1/');
        });
      });
    });
  });
});
