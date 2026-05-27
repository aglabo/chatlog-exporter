// src: scripts/__tests__/unit/process-classify.unit.spec.ts
// @(#): processClassify のユニットテスト
//       対象: processClassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { processClassify } from '../../classify-chatlogs.ts';

// ─── Helpers
// types
import type { ClassifyBuffer, ProjectDicEntry } from '../../types/classify.types.ts';

// constants
import { CLASSIFY_ACTIONS } from '../../types/classify.types.ts';

// ─── Internal Helpers
import { _makeEntry } from '../_helpers/classify-test-helpers.ts';

// constants
/** プロジェクト辞書（AI を呼び出さないテスト用に proj-a のみ定義）。 */
const _PROJECTS: ProjectDicEntry = { 'proj-a': {} };

/** processClassify に渡す最小 config（AI 分類は空配列になるので実際には使われない）。 */
const _CONFIG = { chunkSize: 10, concurrency: 1, model: 'opus' };

// ─── Tests

/**
 * `processClassify` のユニットテストスイート。
 *
 * AI なし事前分類 → AI 分類のパイプラインを検証する。
 * テスト対象を `_remaining=[]` になるケースに限定し、実 AI CLI を呼ばない。
 *
 * テスト ID 範囲: T-CL-PC-01 〜 T-CL-PC-02
 *
 * @see processClassify
 */
describe('processClassify', () => {
  /**
   * 正常系: AI なし事前分類ですべて解決するケース。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PC-01: frontmatter に project あり(MOVE) + 本文短小(FALLBACK MOVE) → result.length=2, 両方 MOVE', async () => {
      // frontmatter に project: 'proj-a' あり、パスは proj-a サブディレクトリ外 → MOVE
      const _entryMove = _makeEntry('/tmp/input/test.md', { project: 'proj-a' }, '');
      // frontmatter なし、本文が短い (5文字 < 50) → FALLBACK MOVE
      const _entryShort = _makeEntry('/tmp/input/short.md', {}, 'short');

      const _buffer: ClassifyBuffer = [
        { file: _entryMove },
        { file: _entryShort },
      ];

      const result = await processClassify(_buffer, _PROJECTS, _CONFIG);

      assertEquals(result.length, 2);
      assertEquals(result[0].action, CLASSIFY_ACTIONS.MOVE);
      assertEquals(result[1].action, CLASSIFY_ACTIONS.MOVE);
    });
  });

  /**
   * エッジケース: already-in-subdir でスキップになるケース。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PC-02: frontmatter に project あり、パスが proj-a サブディレクトリ内 → result.length=1, SKIP', async () => {
      // srcDir '/tmp/input/proj-a' は '/proj-a' で終わる → SKIP
      const _entrySkip = _makeEntry('/tmp/input/proj-a/test.md', { project: 'proj-a' }, '');

      const _buffer: ClassifyBuffer = [{ file: _entrySkip }];

      const result = await processClassify(_buffer, _PROJECTS, _CONFIG);

      assertEquals(result.length, 1);
      assertEquals(result[0].action, CLASSIFY_ACTIONS.SKIP);
    });
  });
});
