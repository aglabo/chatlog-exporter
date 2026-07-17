// src: scripts/modules/__tests__/functional/classify-by-ai.functional.spec.ts
// @(#): classifyByAI の機能テスト
//       REMAINING 抽出 → runChunked 分割実行 → flat 結合のフロー（Deno.Command モック）
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// cspell:words MoveByAI

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyByAI } from '../../classify-ai.ts';

// ─── Helpers
// types
import type { ChatlogCache } from '../../../../../_scripts/classes/ChatlogCache.class.ts';
import type { ClassifyBuffer, ClassifyConfig, ClassifyResult, ProjectDicEntry } from '../../../types/classify.types.ts';
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
 * REMAINING エントリの抽出・チャンク分割並列実行・結果の flat 結合・0件時の早期 return を検証する。
 *
 * テスト ID 範囲: T-CL-CBA-01 〜 T-CL-CBA-04
 *
 * @see classifyByAI
 */
describe('classifyByAI', () => {
  /**
   * 正常系: REMAINING エントリを AI で分類し、結果バッファを返すケース。
   */
  describe('When: 正常系', () => {
    let mockHandle: CommandMockHandle;
    let cache: ChatlogCache<ClassifyResult>;

    beforeEach(async () => {
      cache = await _makeEmptyClassifyCache();
    });

    afterEach(() => {
      mockHandle.restore();
    });

    it('[Normal] T-CL-CBA-01-01: REMAINING 2件・chunkSize=2 → buffer に 2件、action=MOVEBYAI', async () => {
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
        { file: 'b.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));

      const allEntries: ClassifyBuffer = [
        {
          file: _makeClassifyChatlogEntry('a.md'),
          filePath: '/tmp/input/a.md',
          action: CLASSIFY_ACTIONS.REMAINING,
        },
        {
          file: _makeClassifyChatlogEntry('b.md'),
          filePath: '/tmp/input/b.md',
          action: CLASSIFY_ACTIONS.REMAINING,
        },
      ];

      const buffer = await classifyByAI(allEntries, _PROJECTS, _makeConfig(), cache);

      assertEquals(buffer.length, 2);
      assertEquals(buffer.every((e) => e.action === CLASSIFY_ACTIONS.MOVEBYAI), true);
    });

    it('[Normal] T-CL-CBA-02-01: REMAINING 3件・chunkSize=1 → 3チャンクの結果が flat 結合されて 3件返る', async () => {
      const counter = { calls: 0 };
      const response = JSON.stringify([
        { file: 'x.md', project: 'app1', confidence: 0.8, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeCountingMock(response, counter));

      const allEntries: ClassifyBuffer = ['a.md', 'b.md', 'c.md'].map((filename) => ({
        file: _makeClassifyChatlogEntry(filename),
        filePath: `/tmp/input/${filename}`,
        action: CLASSIFY_ACTIONS.REMAINING,
      }));

      const buffer = await classifyByAI(allEntries, _PROJECTS, _makeConfig({ chunkSize: 1 }), cache);

      // chunkSize=1 で 3件 → 3チャンクに分割され、claude CLI が 3回呼び出される
      assertEquals(counter.calls, 3);
      // flat() されていない場合 buffer[0] はネストした配列になり action は undefined になる
      assertEquals(buffer.length, 3);
      assertEquals(buffer.every((e) => e.action === CLASSIFY_ACTIONS.MOVEBYAI), true);
    });

    it('[Normal] T-CL-CBA-03-01: REMAINING 以外のアクションが混在 → REMAINING の1件のみが分類対象になる', async () => {
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));

      const allEntries: ClassifyBuffer = [
        {
          file: _makeClassifyChatlogEntry('a.md'),
          filePath: '/tmp/input/a.md',
          action: CLASSIFY_ACTIONS.REMAINING,
        },
        { file: null, filePath: '/tmp/input/b.md', action: CLASSIFY_ACTIONS.SKIP },
        { file: null, filePath: '/tmp/input/c.md', action: CLASSIFY_ACTIONS.MOVE },
        { file: null, filePath: '/tmp/input/d.md', action: CLASSIFY_ACTIONS.ERROR, reason: 'load failed' },
      ];

      const buffer = await classifyByAI(allEntries, _PROJECTS, _makeConfig(), cache);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].filePath, '/tmp/input/a.md');
    });

    it('[Normal] T-CL-CBA-05-01: AI 判定成功 → cache に判定結果が書き込まれる', async () => {
      const response = JSON.stringify([
        { file: 'a.md', project: 'app1', confidence: 0.9, reason: 'matched' },
      ]);
      mockHandle = installCommandMock(makeSuccessMock(new TextEncoder().encode(response)));

      const allEntries: ClassifyBuffer = [
        {
          file: _makeClassifyChatlogEntry('a.md'),
          filePath: '/tmp/input/a.md',
          action: CLASSIFY_ACTIONS.REMAINING,
        },
      ];

      await classifyByAI(allEntries, _PROJECTS, _makeConfig(), cache);

      assertEquals(cache.read('/tmp/input/a.md'), { project: 'app1', confidence: 0.9, reason: 'matched' });
    });
  });

  /**
   * エッジケース: REMAINING エントリが 0 件の場合の早期 return。
   */
  describe('When: エッジケース', () => {
    let mockHandle: CommandMockHandle;
    let counter: { calls: number };
    let cache: ChatlogCache<ClassifyResult>;

    beforeEach(async () => {
      counter = { calls: 0 };
      mockHandle = installCommandMock(makeCountingMock('[]', counter));
      cache = await _makeEmptyClassifyCache();
    });

    afterEach(() => {
      mockHandle.restore();
    });

    it('[Edge] T-CL-CBA-04-01: REMAINING 以外のみ → 空配列を返し claude CLI は呼び出されない', async () => {
      const allEntries: ClassifyBuffer = [
        { file: null, filePath: '/tmp/input/a.md', action: CLASSIFY_ACTIONS.SKIP },
        { file: null, filePath: '/tmp/input/b.md', action: CLASSIFY_ACTIONS.MOVE },
      ];

      const buffer = await classifyByAI(allEntries, _PROJECTS, _makeConfig(), cache);

      assertEquals(buffer, []);
      assertEquals(counter.calls, 0);
    });

    it('[Edge] T-CL-CBA-04-02: allEntries が空配列 → 空配列を返し claude CLI は呼び出されない', async () => {
      const buffer = await classifyByAI([], _PROJECTS, _makeConfig(), cache);

      assertEquals(buffer, []);
      assertEquals(counter.calls, 0);
    });
  });
});
