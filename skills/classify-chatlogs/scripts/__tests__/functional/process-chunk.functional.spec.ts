// src: scripts/__tests__/functional/classify-chatlogs.processChunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       runClaude + classifyFile の連携フロー（Deno.Command モック・dryRun=true）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// -- BDD modules --
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// test target
import { processChunk } from '../../classify-chatlogs.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../_scripts/constants/defaults.constants.ts';
import { FALLBACK_PROJECT } from '../../constants/classify.constants.ts';
// classes
import { ClassifyChatlogEntry } from '../../classes/ClassifyChatlogEntry.class.ts';
// types
import type { ClassifyStats, ProjectDicEntry } from '../../types/classify.types.ts';

// helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { CommandMockHandle } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';
import type { LoggerStub } from '../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── テスト用ヘルパー ──────────────────────────────────────────────────────────

function _makeClassifyChatlogEntry(filename: string, entryText?: string): ClassifyChatlogEntry {
  const text = entryText
    ?? `---\ntitle: Test Title\ncategory: development\ntopics:\n  - API\ntags:\n  - typescript\n---\n本文`;
  return new ClassifyChatlogEntry(text, `/tmp/input/${filename}`);
}

function _makeStats(): ClassifyStats {
  return { moved: 0, skipped: 0, error: 0 };
}

// ─── T-CL-PC-01: 正常分類 → stats.moved インクリメント ───────────────────────

describe('processChunk', () => {
  describe('Given: 有効な分類結果を返す Deno.Command モック', () => {
    describe('When: processChunk([fileMeta], projects, true, stats) を呼び出す', () => {
      describe('Then: T-CL-PC-01 - 正常分類 → stats.moved インクリメント', () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          const response = JSON.stringify([
            { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          mockHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-01-01: stats.moved が 1 になる', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-PC-01-02: stats.error が 0 のまま', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.error, 0);
        });

        it('T-CL-PC-01-03: classify ログが infoLogs に記録される', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.infoLogs.some((l) => l.includes('classify:')),
            true,
            'classify ログが infoLogs に記録されていない',
          );
        });

        it('T-CL-PC-01-04: [dry-run] ログが infoLogs に記録される', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.infoLogs.some((l) => l.includes('[dry-run]')),
            true,
            '[dry-run] ログが infoLogs に記録されていない',
          );
        });
      });
    });
  });

  // ─── T-CL-PC-02: Claude CLI エラー → FALLBACK_PROJECT で全件処理 ───────────

  describe('Given: Claude CLI が失敗する Deno.Command モック', () => {
    describe('When: processChunk([fileMeta1, fileMeta2], projects, true, stats) を呼び出す', () => {
      describe(`Then: T-CL-PC-02 - CLI エラー → ${FALLBACK_PROJECT} で全件処理`, () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          mockHandle = installCommandMock(makeFailMock(1));
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-02-01: stats.moved が ファイル数（2）になる', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md'), _makeClassifyChatlogEntry('b.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.moved, 2);
        });

        it('T-CL-PC-02-02: stats.error が 0 のまま（fallback 処理成功）', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md'), _makeClassifyChatlogEntry('b.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.error, 0);
        });

        it('T-CL-PC-02-03: warn ログが warnLogs に記録される', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md'), _makeClassifyChatlogEntry('b.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.warnLogs.some((l) => l.includes('claude CLI 実行失敗')),
            true,
            '警告ログが warnLogs に記録されていない',
          );
        });
      });
    });
  });

  // ─── T-CL-PC-03: JSON パース失敗 → FALLBACK_PROJECT で全件処理 ──────────────

  describe('Given: JSON でないテキストを返す Deno.Command モック', () => {
    describe('When: processChunk([fileMeta], projects, true, stats) を呼び出す', () => {
      describe(`Then: T-CL-PC-03 - JSON パース失敗 → ${FALLBACK_PROJECT} で全件処理`, () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          mockHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
          );
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-03-01: stats.moved が 1 になる', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-PC-03-02: stats.error が 0 のまま', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.error, 0);
        });

        it('T-CL-PC-03-03: warn ログが warnLogs に記録される', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.warnLogs.some((l) => l.includes('JSON パース失敗')),
            true,
            '警告ログが warnLogs に記録されていない',
          );
        });
      });
    });
  });

  // ─── T-CL-PC-05: MIN_CLASSIFIABLE_LENGTH skip 分岐 ──────────────────────────

  describe('Given: hasMeta=false かつ fullLength < MIN_CLASSIFIABLE_LENGTH のエントリ', () => {
    describe('When: processChunk([shortEntry], projects, true, stats) を呼び出す', () => {
      describe('Then: T-CL-PC-05 - AI スキップ → FALLBACK_PROJECT で分類', () => {
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
        });

        afterEach(() => {
          loggerStub.restore();
        });

        it('T-CL-PC-05-01: warnLogs に "[skip-ai: too-short]" が含まれる', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md', 'a')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.warnLogs.some((l) => l.includes('[skip-ai: too-short]')),
            true,
            'warnLogs に [skip-ai: too-short] が含まれていない',
          );
        });

        it('T-CL-PC-05-02: stats.moved が 1 になる（AI 未呼出し）', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md', 'a')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-PC-05-03: infoLogs に "fallback:misc" が含まれる', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md', 'a')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.infoLogs.some((l) => l.includes(`fallback:${FALLBACK_PROJECT}`)),
            true,
            'infoLogs に fallback:misc が含まれていない',
          );
        });
      });
    });
  });

  describe('Given: hasMeta=true かつ fullLength < MIN_CLASSIFIABLE_LENGTH のエントリ', () => {
    describe('When: processChunk([metaEntry], projects, true, stats) を呼び出す', () => {
      describe('Then: T-CL-PC-05-04 - AI 経由で分類（skip されない）', () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          const response = JSON.stringify([
            { file: 'b.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          mockHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-05-04: hasMeta=true → warnLogs に "[skip-ai: too-short]" が含まれない', async () => {
          // hasMeta=true（title あり）・本文は短い
          const metas = [_makeClassifyChatlogEntry('b.md', '---\ntitle: T\n---\na')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.warnLogs.some((l) => l.includes('[skip-ai: too-short]')),
            false,
            'hasMeta=true なのに [skip-ai: too-short] が記録されている',
          );
        });
      });
    });
  });

  describe('Given: 短文エントリ1件と通常エントリ1件の混合チャンク', () => {
    describe('When: processChunk([shortEntry, normalEntry], projects, true, stats) を呼び出す', () => {
      describe('Then: T-CL-PC-05-05 - warnLogs の "[skip-ai: too-short]" は1件のみ', () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          const response = JSON.stringify([
            { file: 'b.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          mockHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-05-05: warnLogs の "[skip-ai: too-short]" は1件のみ', async () => {
          const metas = [
            _makeClassifyChatlogEntry('a.md', 'a'),
            _makeClassifyChatlogEntry('b.md'),
          ];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          const _skipLogs = loggerStub.warnLogs.filter((l) => l.includes('[skip-ai: too-short]'));
          assertEquals(_skipLogs.length, 1, 'warnLogs の [skip-ai: too-short] が1件でない');
        });
      });
    });
  });

  // ─── T-CL-PC-04: 分類結果にファイル名なし → FALLBACK_PROJECT 使用 ───────────

  describe('Given: ファイル名が一致しない分類結果を返す Deno.Command モック', () => {
    describe('When: processChunk([fileMeta], projects, true, stats) を呼び出す', () => {
      describe(`Then: T-CL-PC-04 - ファイル名不一致 → ${FALLBACK_PROJECT} で処理`, () => {
        let mockHandle: CommandMockHandle;
        let loggerStub: LoggerStub;
        let model: string;

        beforeEach(() => {
          model = DEFAULT_AI_MODEL;
          loggerStub = makeLoggerStub();
          // "b.md" の結果を返すが、対象ファイルは "a.md"
          const response = JSON.stringify([
            { file: 'b.md', project: 'app1', confidence: 0.9, reason: 'matched' },
          ]);
          mockHandle = installCommandMock(
            makeSuccessMock(new TextEncoder().encode(response)),
          );
        });

        afterEach(() => {
          mockHandle.restore();
          loggerStub.restore();
        });

        it('T-CL-PC-04-01: stats.moved が 1 になる（FALLBACK_PROJECT で移動）', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(stats.moved, 1);
        });

        it('T-CL-PC-04-02: [dry-run] ログが infoLogs に記録される', async () => {
          const metas = [_makeClassifyChatlogEntry('a.md')];
          const stats = _makeStats();
          const projects: ProjectDicEntry = { app1: {}, misc: {} };

          await processChunk(metas, projects, true, stats, model);

          assertEquals(
            loggerStub.infoLogs.some((l) => l.includes('[dry-run]')),
            true,
            '[dry-run] ログが infoLogs に記録されていない',
          );
        });
      });
    });
  });
});
