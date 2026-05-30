// src: scripts/modules/__tests__/functional/process-chunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       runClaude + バッファ返しのフロー（Deno.Command モック）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processChunk } from '../../classify-ai.ts';

// ─── Helpers
// types
import type { ProjectDicEntry } from '../../../types/classify.types.ts';
// classes
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import {
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import { _makeClassifyChatlogEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';

// ─── Tests

/**
 * `processChunk` の機能テストスイート。
 *
 * AI 呼び出しの成功・失敗・JSON パースエラー・ファイル名不一致を検証する。
 * 戻り値は `ClassifyBuffer`（副作用なし）。
 *
 * テスト ID 範囲: T-CL-PC-01 〜 T-CL-PC-04
 *
 * @see processChunk
 */
describe('processChunk', () => {
  /**
   * 正常系: AI が有効な分類結果を返す場合のバッファ返し確認。
   */
  describe('When: 正常系', () => {
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

    it('[Normal] T-CL-PC-01-01: buffer に 1 件返される（action=moveByAI）', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      const buffer = await processChunk(metas, projects, model);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(buffer[0].project, 'app1');
    });

    it('[Normal] T-CL-PC-01-02: classify ログが infoLogs に記録される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      await processChunk(metas, projects, model);

      assertEquals(
        loggerStub.infoLogs.some((l) => l.includes('classify:')),
        true,
        'classify ログが infoLogs に記録されていない',
      );
    });
  });

  /**
   * 異常系: Claude CLI 失敗・JSON パース失敗の場合に action: ERROR エントリが返される。
   */
  describe('When: 異常系', () => {
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

    it('[Error] T-CL-PC-02-01: CLI エラー → buffer にファイル数（2）分の action: ERROR エントリが返される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md'), _makeClassifyChatlogEntry('b.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const buffer = await processChunk(metas, projects, model);

      assertEquals(buffer.length, 2);
      assertEquals(buffer.every((e) => e.action === CLASSIFY_ACTIONS.ERROR), true);
    });

    it('[Error] T-CL-PC-02-02: warn ログが warnLogs に記録される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model);

      assertEquals(
        loggerStub.warnLogs.some((l) => l.includes('claude CLI 実行失敗')),
        true,
        '警告ログが warnLogs に記録されていない',
      );
    });

    it('[Error] T-CL-PC-03-01: JSON パース失敗 → buffer に action: ERROR エントリが返される', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
      );

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const buffer = await processChunk(metas, projects, model);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, CLASSIFY_ACTIONS.ERROR);
    });

    it('[Error] T-CL-PC-03-02: JSON パース失敗 → warn ログが warnLogs に記録される', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
      );

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model);

      assertEquals(
        loggerStub.warnLogs.some((l) => l.includes('JSON パース失敗')),
        true,
        '警告ログが warnLogs に記録されていない',
      );
    });
  });

  /**
   * エッジケース: ファイル名が一致しない場合の FALLBACK_PROJECT 使用。
   */
  describe('When: エッジケース', () => {
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

    it('[Edge] T-CL-PC-04-01: ファイル名不一致 → buffer に FALLBACK_PROJECT が設定される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const buffer = await processChunk(metas, projects, model);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].project, FALLBACK_PROJECT);
    });

    it('[Edge] T-CL-PC-05-01: 空チャンク → 空バッファを返す', async () => {
      const metas: ChatlogEntry[] = [];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const buffer = await processChunk(metas, projects, model);

      assertEquals(buffer.length, 0);
    });
  });
});
