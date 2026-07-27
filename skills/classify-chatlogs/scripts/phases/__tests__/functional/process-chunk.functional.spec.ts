// src: scripts/phases/__tests__/functional/process-chunk.functional.spec.ts
// @(#): processChunk の機能テスト
//       runClaude + バッファ返しのフロー（Deno.Command モック）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals, assertRejects } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { processChunk } from '../../phase-classify-ai.ts';

// ─── Helpers
// types
import type { ClassifyCache, ProjectDicEntry } from '../../../types/classify.types.ts';
// classes
import type { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import { ChatlogError } from '../../../../../_scripts/classes/ChatlogError.class.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import {
  BaseMockCommand,
  installCommandMock,
  makeFailMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
import {
  _makeClassifyChatlogEntry,
  _makeEmptyClassifyCache,
} from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type {
  CommandMockHandle,
  DenoCommandLike,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';

/**
 * 非ゼロ exit かつ stderr に rate limit 文言を含む出力を模倣するモッククラス。
 *
 * `runAI` の `_isRateLimit` 判定（stderr に対する `/rate.?limit|429/i`）を発火させ、
 * `ChatlogError('AiError', 'RateLimit', ...)` を throw させるために使用する。
 * `BaseMockCommand.spawn()` は `output()` のみを呼ぶため、stderr を持つ `makeOutput()` を独自実装する。
 */
class _RateLimitMockCommand extends BaseMockCommand {
  constructor(_cmd: string, _opts: unknown) {
    super();
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return Promise.resolve({
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: new TextEncoder().encode('rate limit exceeded'),
    });
  }
}

/** `_RateLimitMockCommand` を `DenoCommandLike` として返すファクトリヘルパー。 */
const _makeRateLimitMock = (): DenoCommandLike => _RateLimitMockCommand as unknown as DenoCommandLike;

// ─── Tests

/**
 * `processChunk` の機能テストスイート。
 *
 * AI 呼び出しの成功・失敗・JSON パースエラー・ファイル名不一致を検証する。
 * 戻り値は `ChatlogEntry[]`（副作用なし）。
 *
 * テスト ID 範囲: T-CL-PC-01 〜 T-CL-PC-08
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
    let cache: ChatlogCache<ClassifyCache>;

    beforeEach(async () => {
      model = DEFAULT_AI_MODEL;
      loggerStub = makeLoggerStub();
      cache = await _makeEmptyClassifyCache();
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

    it('[Normal] T-CL-PC-01-01: 処理した filePath 一覧が 1 件返される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      const result = await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(result, ['/tmp/input/a.md']);
    });

    it('[Normal] T-CL-PC-01-02: classify ログが infoLogs に記録される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(
        loggerStub.infoLogs.some((l) => l.includes('classify:')),
        true,
        'classify ログが infoLogs に記録されていない',
      );
    });

    it('[Normal] T-CL-PC-07-01: AI 判定成功 → cache に project/confidence/reason/action が書き込まれる', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(cache.read('/tmp/input/a.md'), {
        project: 'app1',
        confidence: 0.9,
        reason: 'matched',
        action: CLASSIFY_ACTIONS.MOVEBYAI,
      });
    });
  });

  /**
   * 異常系: Claude CLI 失敗・JSON パース失敗の場合に action: ERROR エントリが返される。
   */
  describe('When: 異常系', () => {
    let mockHandle: CommandMockHandle;
    let loggerStub: LoggerStub;
    let model: string;
    let cache: ChatlogCache<ClassifyCache>;

    beforeEach(async () => {
      model = DEFAULT_AI_MODEL;
      loggerStub = makeLoggerStub();
      cache = await _makeEmptyClassifyCache();
      mockHandle = installCommandMock(makeFailMock(1));
    });

    afterEach(() => {
      mockHandle.restore();
      loggerStub.restore();
    });

    it('[Error] T-CL-PC-02-01: CLI エラー → 処理した filePath 一覧（2件）が返される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md'), _makeClassifyChatlogEntry('b.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const result = await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(result, ['/tmp/input/a.md', '/tmp/input/b.md']);
    });

    it('[Error] T-CL-PC-02-02: warn ログが warnLogs に記録される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(
        loggerStub.warnLogs.some((l) => l.includes('claude CLI 実行失敗')),
        true,
        '警告ログが warnLogs に記録されていない',
      );
    });

    it('[Error] T-CL-PC-02-03: CLI エラー → cache に action: ERROR が書き込まれる', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(cache.read('/tmp/input/a.md').action, CLASSIFY_ACTIONS.ERROR);
    });

    it('[Error] T-CL-PC-03-01: JSON パース失敗 → 処理した filePath 一覧が返される', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
      );

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const result = await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(result, ['/tmp/input/a.md']);
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

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(
        loggerStub.warnLogs.some((l) => l.includes('JSON パース失敗')),
        true,
        '警告ログが warnLogs に記録されていない',
      );
    });

    it('[Error] T-CL-PC-03-03: JSON パース失敗 → cache に action: ERROR が書き込まれる', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode('これはJSONではありません')),
      );

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(cache.read('/tmp/input/a.md').action, CLASSIFY_ACTIONS.ERROR);
    });

    it('[Error] T-CL-PC-08-01: rate limit エラー → 握りつぶさず re-throw される', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(_makeRateLimitMock());

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const error = await assertRejects(
        () => processChunk(metas, projects, model, cache, new AbortController()),
        ChatlogError,
      );
      assertEquals(error.kind, 'AiError');
      assertEquals(error.subindex, 'RateLimit');
    });

    it('[Error] T-CL-PC-08-02: rate limit エラー → cache には書き込まれない', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      mockHandle = installCommandMock(_makeRateLimitMock());

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await assertRejects(
        () => processChunk(metas, projects, model, cache, new AbortController()),
        ChatlogError,
      );
      assertEquals(cache.read('/tmp/input/a.md'), {});
    });

    it('[Error] T-CL-PC-09-01: 外部 signal が abort 済み → ChatlogError(Aborted/ExternalAbort) を握りつぶさず re-throw する', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };
      const ctl = new AbortController();
      ctl.abort();

      const error = await assertRejects(
        () => processChunk(metas, projects, model, cache, ctl),
        ChatlogError,
      );
      assertEquals(error.kind, 'Aborted');
      assertEquals(error.subindex, 'ExternalAbort');
    });

    it('[Error] T-CL-PC-09-02: 外部 signal が abort 済み → cache には ERROR が書き込まれない', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };
      const ctl = new AbortController();
      ctl.abort();

      await assertRejects(
        () => processChunk(metas, projects, model, cache, ctl),
        ChatlogError,
      );
      assertEquals(cache.read('/tmp/input/a.md'), {});
    });
  });

  /**
   * エッジケース: ファイル名が一致しない場合の FALLBACK_PROJECT 使用。
   */
  describe('When: エッジケース', () => {
    let mockHandle: CommandMockHandle;
    let loggerStub: LoggerStub;
    let model: string;
    let cache: ChatlogCache<ClassifyCache>;

    beforeEach(async () => {
      model = DEFAULT_AI_MODEL;
      loggerStub = makeLoggerStub();
      cache = await _makeEmptyClassifyCache();
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

    it('[Edge] T-CL-PC-04-01: ファイル名不一致 → cache に FALLBACK_PROJECT が設定される', async () => {
      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(cache.read('/tmp/input/a.md').project, FALLBACK_PROJECT);
    });

    it('[Edge] T-CL-PC-05-01: 空チャンク → 空配列を返す', async () => {
      const metas: ChatlogEntry[] = [];
      const projects: ProjectDicEntry = { app1: {}, misc: {} };

      const result = await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(result, []);
    });

    it('[Edge] T-CL-PC-06-01: AI応答に同じfile名が2件含まれる → 先頭要素のprojectが採用される', async () => {
      mockHandle.restore();
      loggerStub.restore();
      loggerStub = makeLoggerStub();
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched first' },
        { file: 'a.md', project: 'app2', confidence: 0.8, reason: 'matched second' },
      ]);
      mockHandle = installCommandMock(
        makeSuccessMock(new TextEncoder().encode(response)),
      );

      const metas = [_makeClassifyChatlogEntry('a.md')];
      const projects: ProjectDicEntry = { app1: {}, app2: {}, misc: {} };

      await processChunk(metas, projects, model, cache, new AbortController());

      assertEquals(cache.read('/tmp/input/a.md').project, 'app1');
    });
  });
});
