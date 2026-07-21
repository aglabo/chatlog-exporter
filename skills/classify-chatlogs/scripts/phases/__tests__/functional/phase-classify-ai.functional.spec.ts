// src: scripts/phases/__tests__/functional/phase-classify-ai.functional.spec.ts
// @(#): classifyByAI の機能テスト
//       runChunked 分割実行 → cache 書き込みのフロー（Deno.Command モック）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyByAI } from '../../phase-classify-ai.ts';

// ─── Helpers
import { makeLoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';
// types
import type { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import type { ChatlogEntry } from '../../../../../_scripts/classes/ChatlogEntry.class.ts';
import type { ClassifyCache, ClassifyConfig, ProjectDicEntry } from '../../../types/classify.types.ts';
// constants
import { DEFAULT_AI_MODEL } from '../../../../../_scripts/constants/defaults.constants.ts';
import { CLASSIFY_ACTIONS } from '../../../types/classify.types.ts';

// ─── Internal Helpers
import {
  installCommandMock,
  makeCountingMock,
  makeSuccessMock,
} from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import {
  _makeClassifyChatlogEntry,
  _makeEmptyClassifyCache,
} from '../../../__tests__/_helpers/classify-test-helpers.ts';
// types
import type { CommandMockHandle } from '../../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
import type { LoggerStub } from '../../../../../_scripts/__tests__/helpers/logger-stub.ts';

// constants
/** テスト共通の空プロジェクト辞書。分類対象プロジェクトを問わないテストで使用する。 */
const _PROJECTS: ProjectDicEntry = { app1: {}, misc: {} };

/** テスト共通の分類設定。chunkSize/concurrency/model のみを指定する。 */
const _makeConfig = (
  overrides: Partial<Pick<ClassifyConfig, 'chunkSize' | 'concurrency' | 'model'>> = {},
): Pick<ClassifyConfig, 'chunkSize' | 'concurrency' | 'model'> => ({
  chunkSize: 2,
  concurrency: 2,
  model: DEFAULT_AI_MODEL,
  ...overrides,
});

// ─── Tests

/**
 * `classifyByAI` の機能テストスイート。
 *
 * 渡された `ChatlogEntry[]` のチャンク分割並列実行・cache への書き込み・0件時の早期 return を検証する。
 *
 * テスト ID 範囲: T-CL-CBA-01 〜 T-CL-CBA-04
 *
 * @see classifyByAI
 */
describe('classifyByAI', () => {
  /**
   * 正常系: 渡されたエントリを AI で分類し、cache に判定結果を書き込むケース。
   */
  describe('When: 正常系', () => {
    let mockHandle: CommandMockHandle;
    let cache: ChatlogCache<ClassifyCache>;

    beforeEach(async () => {
      cache = await _makeEmptyClassifyCache();
    });

    afterEach(() => {
      mockHandle.restore();
    });

    it('[Normal] T-CL-CBA-01-01: 対象 2件・chunkSize=2 → 両方の cache に action=MOVEBYAI が書き込まれる', async () => {
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
        { file: 'b.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));

      const targets: ChatlogEntry[] = [
        _makeClassifyChatlogEntry('a.md'),
        _makeClassifyChatlogEntry('b.md'),
      ];

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache, false);

      assertEquals(cache.read('/tmp/input/a.md').action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(cache.read('/tmp/input/b.md').action, CLASSIFY_ACTIONS.MOVEBYAI);
    });

    it('[Normal] T-CL-CBA-02-01: 対象 3件・chunkSize=1 → claude CLI が 3回呼び出され、3件とも cache に書き込まれる', async () => {
      const counter = { calls: 0 };
      const response = JSON.stringify([
        { file: 'x.md', project: 'app1', confidence: 0.8, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeCountingMock(response, counter));

      const targets: ChatlogEntry[] = ['a.md', 'b.md', 'c.md'].map((filename) => _makeClassifyChatlogEntry(filename));

      await classifyByAI(targets, _PROJECTS, _makeConfig({ chunkSize: 1 }), cache, false);

      // chunkSize=1 で 3件 → 3チャンクに分割され、claude CLI が 3回呼び出される
      assertEquals(counter.calls, 3);
      assertEquals(cache.read('/tmp/input/a.md').action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(cache.read('/tmp/input/b.md').action, CLASSIFY_ACTIONS.MOVEBYAI);
      assertEquals(cache.read('/tmp/input/c.md').action, CLASSIFY_ACTIONS.MOVEBYAI);
    });

    it('[Normal] T-CL-CBA-05-01: AI 判定成功 → cache に判定結果が書き込まれる', async () => {
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));

      const targets: ChatlogEntry[] = [_makeClassifyChatlogEntry('a.md')];

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache, false);

      assertEquals(cache.read('/tmp/input/a.md'), {
        project: 'app1',
        confidence: 0.9,
        reason: 'matched',
        action: CLASSIFY_ACTIONS.MOVEBYAI,
      });
    });
  });

  /**
   * 正常系: dryRun=true の場合、AI 呼び出しをスキップし cache には何も書き込まないケース。
   */
  describe('When: dry-run', () => {
    let mockHandle: CommandMockHandle;
    let counter: { calls: number };
    let cache: ChatlogCache<ClassifyCache>;
    let loggerStub: LoggerStub;

    beforeEach(async () => {
      counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock('[]', counter));
      cache = await _makeEmptyClassifyCache();
      loggerStub = makeLoggerStub();
    });

    afterEach(() => {
      mockHandle.restore();
      loggerStub.restore();
    });

    it('[Normal] T-CL-CBA-06-01: dryRun=true・対象2件 → claude CLI は呼び出されず、cache には何も書き込まれない', async () => {
      const targets: ChatlogEntry[] = [
        _makeClassifyChatlogEntry('a.md'),
        _makeClassifyChatlogEntry('b.md'),
      ];

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache, true);

      assertEquals(counter.calls, 0);
      assertEquals(cache.read('/tmp/input/a.md').action, undefined);
      assertEquals(cache.read('/tmp/input/a.md').project, undefined);
      assertEquals(cache.read('/tmp/input/b.md').action, undefined);
      assertEquals(cache.read('/tmp/input/b.md').project, undefined);
    });

    it('[Normal] T-CL-CBA-06-02: dryRun=true・対象1件 → logger.dryrun が呼び出される', async () => {
      const targets: ChatlogEntry[] = [_makeClassifyChatlogEntry('a.md')];

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache, true);

      assertEquals(loggerStub.dryrunLogs.length > 0, true);
    });

    it('[Edge] T-CL-CBA-06-03: dryRun=true・targets が空配列 → cache 書き込みも logger.dryrun も呼ばれない', async () => {
      await classifyByAI([], _PROJECTS, _makeConfig(), cache, true);

      assertEquals(counter.calls, 0);
      assertEquals(loggerStub.dryrunLogs.length, 0);
    });

    it('[Edge] T-CL-CBA-06-04: dryRun=true・concurrency=2・targets=5件 → cache.write の同時実行数のピークが concurrency を超えない', async () => {
      let current = 0;
      let peak = 0;
      const originalWrite = cache.write.bind(cache);
      cache.write = async (filePath, data) => {
        current++;
        peak = Math.max(peak, current);
        await originalWrite(filePath, data);
        current--;
      };

      const targets: ChatlogEntry[] = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((filename) =>
        _makeClassifyChatlogEntry(filename)
      );

      await classifyByAI(targets, _PROJECTS, _makeConfig({ concurrency: 2 }), cache, true);

      assertEquals(peak <= 2, true);
    });
  });

  /**
   * エッジケース: 対象エントリが 0 件の場合の早期 return。
   */
  describe('When: エッジケース', () => {
    let mockHandle: CommandMockHandle;
    let counter: { calls: number };
    let cache: ChatlogCache<ClassifyCache>;

    beforeEach(async () => {
      counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock('[]', counter));
      cache = await _makeEmptyClassifyCache();
    });

    afterEach(() => {
      mockHandle.restore();
    });

    it('[Edge] T-CL-CBA-04-02: targets が空配列 → 何も起きず claude CLI は呼び出されない', async () => {
      const result = await classifyByAI([], _PROJECTS, _makeConfig(), cache, false);

      assertEquals(result, undefined);
      assertEquals(counter.calls, 0);
    });
  });
});
