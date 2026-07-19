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

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache);

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

      await classifyByAI(targets, _PROJECTS, _makeConfig({ chunkSize: 1 }), cache);

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

      await classifyByAI(targets, _PROJECTS, _makeConfig(), cache);

      assertEquals(cache.read('/tmp/input/a.md'), {
        project: 'app1',
        confidence: 0.9,
        reason: 'matched',
        action: CLASSIFY_ACTIONS.MOVEBYAI,
      });
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
      const result = await classifyByAI([], _PROJECTS, _makeConfig(), cache);

      assertEquals(result, undefined);
      assertEquals(counter.calls, 0);
    });
  });
});
