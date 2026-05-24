// src: scripts/modules/__tests__/unit/classify-meta.unit.spec.ts
// @(#): preClassify の単体テスト
//       対象: preClassify
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { preClassify } from '../../classify-meta.ts';
// types
import type { ClassifyBufferEntry } from '../../../types/classify.types.ts';

// ─── Helpers
import { FALLBACK_PROJECT } from '../../../constants/classify.constants.ts';

// ─── Internal Helpers
import { _makeEntry } from '../../../__tests__/_helpers/classify-test-helpers.ts';

// ─── Tests

/**
 * `preClassify` のユニットテストスイート。
 *
 * frontmatter の `project` フィールドと本文長に基づく事前分類ロジックを検証する。
 *
 * テスト ID 範囲: T-CL-PRE-01 〜 T-CL-PRE-06
 *
 * @see preClassify
 */
describe('preClassify', () => {
  /**
   * 正常系: frontmatter の `project` フィールドが存在する場合の分岐テスト。
   */
  describe('When: 正常系', () => {
    it('[Normal] T-CL-PRE-01: project フィールドあり + 既に正しいディレクトリ内 → action=skip, buffer に追加, remaining に含まれない', () => {
      const _entry = _makeEntry('/tmp/chatlogs/app1/test.md', { project: 'app1' }, '本文テキスト');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'skip');
      assertEquals(buffer[0].project, 'app1');
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-02: project フィールドあり + ディレクトリが違う → action=move, buffer に追加', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', { project: 'app1' }, '本文テキスト');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'move');
      assertEquals(buffer[0].project, 'app1');
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-03: project フィールドなし + hasMeta=false + 短い → FALLBACK_PROJECT, action=move, buffer に追加', () => {
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, 'short');

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 1);
      assertEquals(buffer[0].action, 'move');
      assertEquals(buffer[0].project, FALLBACK_PROJECT);
      assertEquals(buffer[0].byAI, false);
      assertEquals(remaining.length, 0);
    });

    it('[Normal] T-CL-PRE-04: project フィールドなし + hasMeta=true → remaining に追加（AI 処理対象）', () => {
      const _entry = _makeEntry(
        '/tmp/chatlogs/test.md',
        { title: 'Some Title', category: 'development' },
        'short',
      );

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 0);
      assertEquals(remaining.length, 1);
    });

    it('[Normal] T-CL-PRE-05: project フィールドなし + hasMeta=false + 長い → remaining に追加', () => {
      const _longContent = 'a'.repeat(100);
      const _entry = _makeEntry('/tmp/chatlogs/test.md', {}, _longContent);

      const { buffer, remaining } = preClassify([_entry]);

      assertEquals(buffer.length, 0);
      assertEquals(remaining.length, 1);
    });
  });

  /**
   * エッジケース: 複数エントリが混在する場合のテスト。
   */
  describe('When: エッジケース', () => {
    it('[Edge] T-CL-PRE-06: 混合ケース（skip/move/remaining が混在）', () => {
      const _skipEntry = _makeEntry('/tmp/chatlogs/app1/a.md', { project: 'app1' }, '本文');
      const _moveEntry = _makeEntry('/tmp/chatlogs/b.md', { project: 'app2' }, '本文');
      const _shortEntry = _makeEntry('/tmp/chatlogs/c.md', {}, 'x');
      const _remainingEntry = _makeEntry('/tmp/chatlogs/d.md', { title: 'Title' }, 'x');
      const _longEntry = _makeEntry('/tmp/chatlogs/e.md', {}, 'x'.repeat(100));

      const { buffer, remaining } = preClassify([
        _skipEntry,
        _moveEntry,
        _shortEntry,
        _remainingEntry,
        _longEntry,
      ]);

      // skip: 1件 (app1/a.md)
      // move: 2件 (b.md → app2, c.md → FALLBACK_PROJECT)
      // remaining: 2件 (d.md, e.md)
      assertEquals(buffer.length, 3);
      assertEquals(remaining.length, 2);

      const _skipEntries = buffer.filter((e: ClassifyBufferEntry) => e.action === 'skip');
      const _moveEntries = buffer.filter((e: ClassifyBufferEntry) => e.action === 'move');
      assertEquals(_skipEntries.length, 1);
      assertEquals(_moveEntries.length, 2);
    });
  });
});
